"""PostgresRepository storage implementation."""

from __future__ import annotations

import json
import uuid
from typing import Any

from app.domain.errors import ApiError
from app.domain.lessons import (
    card_docs,
    check_owner,
    edit_planned,
    ensure_approved,
    lesson_source_ids,
    tracks_with_lessons,
)
from app.domain.search import Hit
from app.domain.sources import CORE_SOURCE_FIELDS, source_extra


class PostgresRepository:
    kind = "postgres"

    def __init__(self, pool: Any):
        self.pool = pool

    @classmethod
    async def connect(cls, dsn: str) -> "PostgresRepository":
        import asyncpg

        async def init(conn):
            await conn.set_type_codec("jsonb", encoder=json.dumps, decoder=json.loads, schema="pg_catalog")

        # statement_cache_size=0 keeps us compatible with Supabase's transaction pooler.
        pool = await asyncpg.create_pool(dsn, min_size=1, max_size=8, init=init, statement_cache_size=0)
        return cls(pool)

    async def list_tracks(self) -> list[dict]:
        async with self.pool.acquire() as c:
            row = await c.fetchrow("select data from app_config where key = 'tracks'")
            lessons = await c.fetch("select data from lessons where status = 'published'")
        tracks = row["data"] if row else []
        return tracks_with_lessons(tracks, {r["data"]["id"]: r["data"] for r in lessons})

    async def get_lesson(self, lesson_id: str, *, include_unpublished: bool = False) -> dict | None:
        q = "select data, status, author_id from lessons where id = $1" + (
            "" if include_unpublished else " and status = 'published'"
        )
        async with self.pool.acquire() as c:
            row = await c.fetchrow(q, lesson_id)
        return (
            {**row["data"], "status": row["status"], "author_id": str(row["author_id"]) if row["author_id"] else None}
            if row
            else None
        )

    async def get_sources(self, ids: list[str]) -> dict[str, dict]:
        if not ids:
            return {}
        import asyncpg

        cols = ", ".join(CORE_SOURCE_FIELDS)
        async with self.pool.acquire() as c:
            try:
                rows = await c.fetch(f"select {cols}, extra from sources where id = any($1::text[])", ids)
            except asyncpg.UndefinedColumnError:  # migration 0002 not applied yet
                rows = await c.fetch(f"select {cols} from sources where id = any($1::text[])", ids)
        out = {}
        for r in rows:
            row = dict(r)
            extra = row.pop("extra", None) or {}
            out[row["id"]] = {**extra, **row}
        return out

    async def search(self, query: str, *, k: int, embedding: list[float] | None = None) -> list[Hit]:
        async with self.pool.acquire() as c:
            if embedding is not None:
                vec = "[" + ",".join(f"{x:.6f}" for x in embedding) + "]"
                rows = await c.fetch(
                    "select source_id, content, 1 - (embedding OPERATOR(extensions.<=>) $1::extensions.vector) as score from source_chunks "
                    "where source_id in (select id from sources where review_status = 'approved') "
                    "and (lesson_id is null or lesson_id in (select id from lessons where status = 'published')) "
                    "order by embedding OPERATOR(extensions.<=>) $1::extensions.vector limit $2",
                    vec,
                    k * 3,
                )
            keyword_rows = await c.fetch(
                "select source_id, content, ts_rank(tsv, plainto_tsquery('simple', $1)) as score from source_chunks "
                "where source_id in (select id from sources where review_status = 'approved') "
                "and (lesson_id is null or lesson_id in (select id from lessons where status = 'published')) "
                "and tsv @@ plainto_tsquery('simple', $1) order by score desc limit $2",
                query,
                k * 3,
            )
            if embedding is None:
                top = max((r["score"] for r in keyword_rows), default=1) or 1
                rows = [{**dict(r), "score": float(r["score"]) / top} for r in keyword_rows]
            else:
                top = max((r["score"] for r in keyword_rows), default=1) or 1
                rows = list(rows) + [{**dict(r), "score": 0.5 + 0.45 * float(r["score"]) / top} for r in keyword_rows]
        best: dict[str, Hit] = {}
        for r in rows:
            h = best.get(r["source_id"])
            if h is None or r["score"] > h.score:
                best[r["source_id"]] = Hit(r["source_id"], float(r["score"]), r["content"])
        return sorted(best.values(), key=lambda h: -h.score)[:k]

    async def add_review_event(self, lesson_id: str, actor_id: str | None, kind: str, payload: dict) -> None:
        async with self.pool.acquire() as c:
            await c.execute(
                "insert into review_events (lesson_id, actor_id, kind, payload) values ($1, $2, $3, $4)",
                lesson_id,
                uuid.UUID(actor_id) if actor_id else None,
                kind,
                payload,
            )

    async def log_tutor(self, tier: str, citation_ids: list[str], latency_ms: int, track: str | None) -> None:
        async with self.pool.acquire() as c:
            await c.execute(
                "insert into tutor_logs (tier, citation_ids, latency_ms, track) values ($1, $2, $3, $4)",
                tier,
                citation_ids,
                latency_ms,
                track,
            )

    async def get_role(self, user_id: str) -> str | None:
        async with self.pool.acquire() as c:
            return await c.fetchval("select role from profiles where id = $1", uuid.UUID(user_id))

    async def get_account(self, user_id: str) -> dict | None:
        async with self.pool.acquire() as c:
            row = await c.fetchrow(
                "select u.email, p.display_name from public.profiles p join auth.users u on u.id = p.id where p.id = $1",
                uuid.UUID(user_id),
            )
        return dict(row) if row else None

    async def search_users(self, query: str) -> list[dict]:
        async with self.pool.acquire() as c:
            rows = await c.fetch(
                "select p.id, u.email, p.display_name, p.role, p.created_at "
                "from public.profiles p join auth.users u on u.id = p.id "
                "where strpos(lower(coalesce(u.email, '')), lower($1)) > 0 "
                "or strpos(lower(coalesce(p.display_name, '')), lower($1)) > 0 "
                "order by p.created_at desc, p.id desc limit 50",
                query,
            )
        return [{**dict(r), "id": str(r["id"])} for r in rows]

    async def set_user_role(self, user_id: str, role: str, actor_id: str) -> None:
        target, actor = uuid.UUID(user_id), uuid.UUID(actor_id)
        async with self.pool.acquire() as c:
            async with c.transaction():
                old = await c.fetchval("select role from public.profiles where id = $1 for update", target)
                if old is None:
                    raise ApiError(404, "not_found", "User not found.")
                await c.execute("update public.profiles set role = $2 where id = $1", target, role)
                await c.execute(
                    "insert into public.admin_events (actor_id, target_id, kind, payload) values ($1, $2, 'role_changed', $3)",
                    actor,
                    target,
                    {"from_role": old, "to_role": role},
                )

    async def content_bundle(self) -> dict:
        async with self.pool.acquire() as c:
            tracks = await c.fetchval("select data from app_config where key = 'tracks'") or []
            rows = await c.fetch("select data, status from lessons where status = 'published'")
            sources = await c.fetch("select id from sources")
        return {
            "tracks": tracks,
            "lessons": {r["data"]["id"]: {**r["data"], "status": r["status"]} for r in rows},
            "sources": await self.get_sources([r["id"] for r in sources]),
        }

    async def staff_lessons(self, user_id: str | None, reviewer: bool) -> list[dict]:
        async with self.pool.acquire() as c:
            rows = await c.fetch(
                "select data, status, author_id from lessons where $2::boolean or author_id = $1::uuid order by updated_at desc",
                uuid.UUID(user_id) if user_id else None,
                reviewer,
            )
        return [
            {**r["data"], "status": r["status"], "author_id": str(r["author_id"]) if r["author_id"] else None}
            for r in rows
        ]

    async def save_draft(self, draft: dict, actor_id: str | None, reviewer: bool) -> None:
        if not actor_id:
            raise ApiError(401, "unauthorized", "A real user session is required for database writes.")
        async with self.pool.acquire() as c:
            async with c.transaction():
                # Conditional upsert also enforces ownership if two authors create the same id concurrently.
                row = await c.fetchrow(
                    "insert into lessons (id, track, module, status, data, author_id) values ($1, $2, $3, 'draft', $4, $5::uuid) "
                    "on conflict (id) do update set track = excluded.track, module = excluded.module, "
                    "status = 'draft', data = excluded.data, updated_at = now() "
                    "where lessons.status <> 'published' and ($6::boolean or lessons.author_id = $5::uuid) returning id, (xmax = 0) as created",
                    draft["id"],
                    draft["track"],
                    draft["module"],
                    {**draft, "status": "draft"},
                    uuid.UUID(actor_id),
                    reviewer,
                )
                if not row:
                    raise ApiError(403, "forbidden", "Only your unpublished drafts can be edited.")
                await c.execute(
                    "insert into review_events (lesson_id, actor_id, kind, payload) values ($1, $2, $3, '{}'::jsonb)",
                    draft["id"],
                    uuid.UUID(actor_id),
                    "created" if row["created"] else "updated",
                )

    async def lesson_history(self, lesson_id: str) -> list[dict]:
        async with self.pool.acquire() as c:
            rows = await c.fetch(
                "select e.id, e.kind, e.payload, e.actor_id, p.display_name as actor_name, u.email as actor_email, e.created_at "
                "from review_events e left join profiles p on p.id = e.actor_id left join auth.users u on u.id = e.actor_id "
                "where e.lesson_id = $1 order by e.created_at desc, e.id desc",
                lesson_id,
            )
        return [
            {**dict(r), "id": str(r["id"]), "actor_id": str(r["actor_id"]) if r["actor_id"] else None} for r in rows
        ]

    async def archive_lesson(self, lesson_id: str, actor_id: str | None, reviewer: bool) -> None:
        async with self.pool.acquire() as c:
            async with c.transaction():
                row = await c.fetchrow("select status, author_id from lessons where id = $1 for update", lesson_id)
                if not row:
                    raise ApiError(404, "not_found", "Lesson not found.")
                check_owner({"author_id": str(row["author_id"]) if row["author_id"] else None}, actor_id, reviewer)
                if row["status"] == "archived":
                    raise ApiError(409, "conflict", "This lesson is already archived.")
                await c.execute(
                    "update lessons set status = 'archived', data = jsonb_set(data, '{status}', '\"archived\"'::jsonb), updated_at = now() where id = $1",
                    lesson_id,
                )
                await c.execute("delete from source_chunks where lesson_id = $1", lesson_id)
                await c.execute(
                    "insert into review_events (lesson_id, actor_id, kind, payload) values ($1, $2, 'archived', '{}'::jsonb)",
                    lesson_id,
                    uuid.UUID(actor_id) if actor_id else None,
                )

    async def transition_lesson(
        self,
        lesson_id: str,
        actor_id: str | None,
        kind: str,
        note: str = "",
        *,
        reviewer: bool = False,
        expected: dict | None = None,
    ) -> str:
        async with self.pool.acquire() as c:
            async with c.transaction():
                row = await c.fetchrow(
                    "select data, status, author_id from lessons where id = $1 for update", lesson_id
                )
                if not row:
                    raise ApiError(404, "not_found", "Lesson not found.")
                lesson = {
                    **row["data"],
                    "status": row["status"],
                    "author_id": str(row["author_id"]) if row["author_id"] else None,
                }
                if expected is not None and lesson != expected:
                    raise ApiError(409, "conflict", "The lesson changed during checks. Try again.")
                if kind != "submit" and not reviewer:
                    raise ApiError(403, "forbidden", "An admin must review this lesson.")
                if kind == "submit" and (
                    (not reviewer and str(row["author_id"]) != actor_id) or row["status"] != "draft"
                ):
                    raise ApiError(403, "forbidden", "Only the author or an admin can submit a draft.")
                if kind != "submit" and row["status"] != "in_review":
                    raise ApiError(409, "conflict", "The lesson must be in review first.")
                if kind == "approve":
                    ids = lesson_source_ids(row["data"])
                    sources = await c.fetch(
                        "select id, review_status from sources where id = any($1::text[]) for share", ids
                    )
                    ensure_approved(row["data"], {s["id"]: dict(s) for s in sources})
                    # Ensure newly published lessons appear in their existing curriculum module.
                    config = await c.fetchval("select data from app_config where key = 'tracks' for update") or []
                    module = next(
                        (
                            m
                            for t in config
                            if t["id"] == row["data"]["track"]
                            for m in t["modules"]
                            if m["id"] == row["data"]["module"]
                        ),
                        None,
                    )
                    if module is None:
                        raise ApiError(400, "bad_request", "Choose an existing track and module.")
                    if lesson_id not in module["lessons"]:
                        module["lessons"].append(lesson_id)
                    await c.execute("update app_config set data = $1, updated_at = now() where key = 'tracks'", config)
                    for doc_id, content, source_ids in card_docs(row["data"]):
                        await c.execute(
                            "insert into source_chunks (id, source_id, lesson_id, lang, content) values ($1, $2, $3, 'mixed', $4) "
                            "on conflict (id) do update set content = excluded.content, source_id = excluded.source_id, embedding = null",
                            doc_id,
                            source_ids[0],
                            lesson_id,
                            content,
                        )
                status = {"submit": "in_review", "approve": "published", "request_changes": "draft"}[kind]
                await c.execute(
                    "update lessons set status = $2, data = jsonb_set(data, '{status}', to_jsonb($2::text)), updated_at = now() where id = $1",
                    lesson_id,
                    status,
                )
                await c.execute(
                    "insert into review_events (lesson_id, actor_id, kind, payload) values ($1, $2, $3, $4)",
                    lesson_id,
                    uuid.UUID(actor_id) if actor_id else None,
                    kind,
                    {"note": note, "reviewed": reviewer} if kind == "approve" else {"note": note},
                )
                return status

    async def unpublish_lesson(self, lesson_id: str, actor_id: str | None, reviewer: bool) -> None:
        async with self.pool.acquire() as c:
            async with c.transaction():
                row = await c.fetchrow("select status, author_id from lessons where id = $1 for update", lesson_id)
                if not row:
                    raise ApiError(404, "not_found", "Lesson not found.")
                check_owner({"author_id": str(row["author_id"]) if row["author_id"] else None}, actor_id, reviewer)
                if row["status"] != "published":
                    raise ApiError(409, "conflict", "Only published lessons can be hidden.")
                await c.execute(
                    "update lessons set status = 'draft', data = jsonb_set(data, '{status}', '\"draft\"'::jsonb), updated_at = now() where id = $1",
                    lesson_id,
                )
                await c.execute("delete from source_chunks where lesson_id = $1", lesson_id)
                await c.execute(
                    "insert into review_events (lesson_id, actor_id, kind, payload) values ($1, $2, 'unpublish', '{}'::jsonb)",
                    lesson_id,
                    uuid.UUID(actor_id) if actor_id else None,
                )

    async def delete_lesson(self, lesson_id: str, actor_id: str | None, reviewer: bool) -> None:
        async with self.pool.acquire() as c:
            async with c.transaction():
                # FOR UPDATE also blocks new progress FK checks until this transaction ends.
                row = await c.fetchrow(
                    "select data, status, author_id from lessons where id = $1 for update", lesson_id
                )
                if not row:
                    raise ApiError(404, "not_found", "Lesson not found.")
                check_owner({"author_id": str(row["author_id"]) if row["author_id"] else None}, actor_id, reviewer)
                if row["status"] != "draft":
                    raise ApiError(409, "conflict", "Only draft lessons can be deleted. Hide it first.")
                if await c.fetchval("select exists(select 1 from progress where lesson_id = $1)", lesson_id):
                    raise ApiError(
                        409,
                        "has_progress",
                        "Learners have progress on this lesson. Keep it hidden instead of deleting it.",
                    )
                config = await c.fetchval("select data from app_config where key = 'tracks' for update") or []
                for track in config:
                    for module in track["modules"]:
                        module["lessons"] = [i for i in module["lessons"] if i != lesson_id]
                await c.execute("update app_config set data = $1, updated_at = now() where key = 'tracks'", config)
                await c.execute("delete from source_chunks where lesson_id = $1", lesson_id)
                await c.execute(
                    "insert into admin_events (actor_id, kind, payload) values ($1, 'lesson_deleted', $2)",
                    uuid.UUID(actor_id) if actor_id else None,
                    {"id": lesson_id, "title": row["data"]["title"]},
                )
                await c.execute("delete from lessons where id = $1", lesson_id)

    async def change_planned(
        self, track: str, module: str, actor_id: str | None, *, title: dict | None = None, index: int | None = None
    ) -> None:
        async with self.pool.acquire() as c:
            async with c.transaction():
                config = await c.fetchval("select data from app_config where key = 'tracks' for update") or []
                kind, payload = edit_planned(config, track, module, title, index)
                await c.execute("update app_config set data = $1, updated_at = now() where key = 'tracks'", config)
                await c.execute(
                    "insert into admin_events (actor_id, kind, payload) values ($1, $2, $3)",
                    uuid.UUID(actor_id) if actor_id else None,
                    kind,
                    payload,
                )

    async def pending_sources(self) -> list[dict]:
        async with self.pool.acquire() as c:
            rows = await c.fetch("select * from sources where review_status = 'pending' order by id")
        return [dict(r) for r in rows]

    async def add_source(self, source: dict) -> dict:
        # An entry that already exists is kept as it is: curated and approved sources are never overwritten.
        cols = ", ".join(CORE_SOURCE_FIELDS)
        places = ", ".join(f"${i + 1}" for i in range(len(CORE_SOURCE_FIELDS) + 1))
        async with self.pool.acquire() as c:
            await c.execute(
                f"insert into sources ({cols}, extra) values ({places}) on conflict (id) do nothing",
                *[source.get(k) for k in CORE_SOURCE_FIELDS],
                source_extra(source),
            )
        return (await self.get_sources([source["id"]]))[source["id"]]

    async def approve_source(self, source_id: str, actor_id: str | None) -> None:
        async with self.pool.acquire() as c:
            async with c.transaction():
                result = await c.execute(
                    "update sources set review_status = 'approved', updated_at = now() where id = $1", source_id
                )
                if result != "UPDATE 1":
                    raise ApiError(404, "not_found", "Source not found.")
                await c.execute(
                    "insert into source_review_events (source_id, actor_id) values ($1, $2)",
                    source_id,
                    uuid.UUID(actor_id) if actor_id else None,
                )

    async def ping(self) -> bool:
        try:
            async with self.pool.acquire() as c:
                return await c.fetchval("select 1") == 1
        except Exception:
            return False

    async def close(self) -> None:
        await self.pool.close()
