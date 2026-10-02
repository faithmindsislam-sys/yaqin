"""Storage. `PgStore` runs on Supabase Postgres; `MemoryStore` serves the JSON in
`content/` so the API runs locally with no infrastructure."""

from __future__ import annotations

import json
import time
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Protocol

from .config import get_settings
from .text import BM25


@dataclass
class Hit:
    source_id: str
    score: float  # cosine similarity (pg) or normalized BM25 (memory)
    passage: str


class Store(Protocol):
    kind: str

    async def list_tracks(self) -> list[dict]: ...
    async def get_lesson(self, lesson_id: str, *, include_unpublished: bool = False) -> dict | None: ...
    async def get_sources(self, ids: list[str]) -> dict[str, dict]: ...
    async def search(self, query: str, *, k: int, embedding: list[float] | None = None) -> list[Hit]: ...
    async def review_queue(self) -> list[dict]: ...
    async def set_lesson_status(self, lesson_id: str, status: str) -> bool: ...
    async def add_review_event(self, lesson_id: str, actor_id: str | None, kind: str, payload: dict) -> None: ...
    async def log_tutor(self, tier: str, citation_ids: list[str], latency_ms: int, track: str | None) -> None: ...
    async def get_role(self, user_id: str) -> str | None: ...
    async def content_bundle(self) -> dict: ...
    async def staff_lessons(self, user_id: str | None, reviewer: bool) -> list[dict]: ...
    async def save_draft(self, draft: dict, actor_id: str | None, reviewer: bool) -> None: ...
    async def transition_lesson(self, lesson_id: str, actor_id: str | None, kind: str, note: str = "") -> str: ...
    async def pending_sources(self) -> list[dict]: ...
    async def approve_source(self, source_id: str, actor_id: str | None) -> None: ...
    async def ping(self) -> bool: ...


def load_content(content_dir: Path) -> tuple[list[dict], dict[str, dict], dict[str, dict]]:
    tracks_path = content_dir / "tracks.json"
    tracks = json.loads(tracks_path.read_text()) if tracks_path.exists() else []
    lessons = {}
    for p in sorted((content_dir / "lessons").glob("*.json")):
        data = json.loads(p.read_text())
        lessons[data["id"]] = data
    sources = {}
    for p in sorted((content_dir / "sources").glob("*.json")):
        for s in json.loads(p.read_text()):
            sources[s["id"]] = s
    return tracks, lessons, sources


def lesson_summary(lesson: dict) -> dict:
    keys = ("id", "track", "module", "level", "minutes", "title", "summary", "cover", "status")
    return {k: lesson.get(k) for k in keys} | {"cards": len(lesson.get("cards", []))}


CORE_SOURCE_FIELDS = ("id", "kind", "ref_en", "ref_ar", "text_ar", "text_en", "translation", "origin", "url", "grading", "review_status")


def source_extra(source: dict) -> dict:
    """Kind-specific fields stored in `sources.extra` (jsonb)."""
    return {k: v for k, v in source.items() if k not in CORE_SOURCE_FIELDS}


def source_passages(source: dict) -> list[tuple[str, str, str]]:
    """Retrievable passages for one source as (chunk suffix, lang, text).

    Hadith explanations and benefits are scholarly commentary: their chunks are
    labelled as such and resolve to the hadith id, so the tutor cites the hadith
    while never presenting the commentary as the hadith itself."""
    ref = f"{source.get('ref_en', '')} | {source.get('ref_ar', '')}"
    out: list[tuple[str, str, str]] = []
    for lang in ("en", "ar"):
        head = ref
        if source.get("kind") == "faq" and source.get(f"question_{lang}"):
            head = f"{ref}\n{source[f'question_{lang}']}"
        if source.get("kind") == "dictionary" and source.get(f"term_{lang}"):
            head = f"{ref}\n{source[f'term_{lang}']}"
        if source.get("kind") == "hadith" and source.get(f"title_{lang}"):
            head = f"{ref}\n{source[f'title_{lang}']}"
        text = source.get(f"text_{lang}")
        if text:
            out.append((lang, lang, f"{head}\n{text}"))
        expl = source.get(f"explanation_{lang}")
        benefits = source.get(f"benefits_{lang}") or []
        if expl or benefits:
            label = "Scholarly explanation (not hadith text)" if lang == "en" else "شرح أهل العلم (ليس من نص الحديث)"
            body = "\n".join([expl or "", *benefits]).strip()
            out.append((f"expl-{lang}", lang, f"{ref}\n[{label}]\n{body}"))
    return out


def passage_text(source: dict) -> str:
    return "\n".join(text for _suffix, _lang, text in source_passages(source))


def card_docs(lesson: dict) -> list[tuple[str, str, list[str]]]:
    """(doc_id, text, source_ids) for each card's reviewed prose, in both languages.
    A card without its own sources points at the lesson's sources."""
    from .retrieval import lesson_source_ids

    fallback = lesson_source_ids(lesson)
    title = " ".join((lesson.get("title") or {}).values())
    out = []
    for card in lesson.get("cards", []):
        parts = [title]
        for field in ("title", "body", "takeaway"):
            parts += [v for v in (card.get(field) or {}).values() if isinstance(v, str)]
        ids = card.get("sources") or fallback
        if ids:
            out.append((f"lesson:{lesson['id']}:{card.get('id')}", " ".join(parts), ids))
    return out


def tracks_with_lessons(tracks: list[dict], lessons: dict[str, dict]) -> list[dict]:
    out = []
    for t in tracks:
        modules = []
        for m in t.get("modules", []):
            items = [lesson_summary(lessons[i]) for i in m.get("lessons", []) if i in lessons and lessons[i].get("status") == "published"]
            modules.append({**{k: v for k, v in m.items() if k != "lessons"}, "lessons": items})
        out.append({**{k: v for k, v in t.items() if k != "modules"}, "modules": modules})
    return out


def ensure_approved(lesson: dict, sources: dict) -> None:
    from .errors import ApiError
    from .retrieval import lesson_source_ids
    ids = lesson_source_ids(lesson)
    if not ids or any(sid not in sources or sources[sid].get("review_status") != "approved" for sid in ids):
        raise ApiError(409, "unapproved_sources", "Approve every cited source before publishing this lesson.")


class MemoryStore:
    kind = "memory"

    def __init__(self, content_dir: Path):
        self.content_dir = content_dir
        self.reload()
        self.events: list[dict] = []
        self.logs: list[dict] = []
        self.roles: dict[str, str] = {}

    def reload(self) -> None:
        self.tracks, self.lessons, self.sources = load_content(self.content_dir)
        self.reload_index()

    async def list_tracks(self) -> list[dict]:
        return tracks_with_lessons(self.tracks, self.lessons)

    async def get_lesson(self, lesson_id: str, *, include_unpublished: bool = False) -> dict | None:
        lesson = self.lessons.get(lesson_id)
        if lesson and (include_unpublished or lesson.get("status") == "published"):
            return lesson
        return None

    async def get_sources(self, ids: list[str]) -> dict[str, dict]:
        return {i: self.sources[i] for i in ids if i in self.sources}

    async def search(self, query: str, *, k: int, embedding: list[float] | None = None) -> list[Hit]:
        results = self.index.search(query, k * 3)
        if not results:
            return []
        top = results[0][1] or 1.0
        best: dict[str, float] = {}
        # Lesson prose resolves to the sources it teaches from; the first one ranks highest.
        for doc_id, score, _hits in results:
            for rank, sid in enumerate(self.doc_sources[doc_id]):
                norm = round(score / top * (1 - 0.05 * rank), 4)
                best[sid] = max(best.get(sid, 0.0), norm)
        ranked = sorted(best, key=lambda i: -best[i])[:k]
        return [Hit(sid, best[sid], passage_text(self.sources[sid])) for sid in ranked]

    async def review_queue(self) -> list[dict]:
        return [lesson_summary(l) for l in self.lessons.values() if l.get("status") == "in_review"]

    async def set_lesson_status(self, lesson_id: str, status: str) -> bool:
        if lesson_id not in self.lessons:
            return False
        self.lessons[lesson_id] = {**self.lessons[lesson_id], "status": status}
        return True

    async def add_review_event(self, lesson_id: str, actor_id: str | None, kind: str, payload: dict) -> None:
        self.events.append({"id": str(uuid.uuid4()), "lesson_id": lesson_id, "actor_id": actor_id,
                            "kind": kind, "payload": payload, "created_at": time.time()})

    async def log_tutor(self, tier: str, citation_ids: list[str], latency_ms: int, track: str | None) -> None:
        self.logs.append({"tier": tier, "citation_ids": citation_ids, "latency_ms": latency_ms, "track": track})

    async def get_role(self, user_id: str) -> str | None:
        return self.roles.get(user_id, "learner")

    async def content_bundle(self) -> dict:
        return {"tracks": self.tracks,
                "lessons": {i: l for i, l in self.lessons.items() if l.get("status") == "published"},
                "sources": self.sources}

    async def staff_lessons(self, user_id: str | None, reviewer: bool) -> list[dict]:
        return [l for l in self.lessons.values() if reviewer or l.get("author_id") == user_id]

    async def save_draft(self, draft: dict, actor_id: str | None, reviewer: bool) -> None:
        from .errors import ApiError
        old = self.lessons.get(draft["id"])
        if old and (old.get("status") == "published" or (not reviewer and old.get("author_id") != actor_id)):
            raise ApiError(403, "forbidden", "Only your unpublished drafts can be edited.")
        self.lessons[draft["id"]] = {**draft, "status": "draft", "author_id": old.get("author_id") if old else actor_id}

    async def transition_lesson(self, lesson_id: str, actor_id: str | None, kind: str, note: str = "") -> str:
        from .errors import ApiError
        lesson = self.lessons.get(lesson_id)
        if not lesson:
            raise ApiError(404, "not_found", "Lesson not found.")
        if kind == "submit" and (lesson.get("author_id") != actor_id or lesson["status"] != "draft"):
            raise ApiError(403, "forbidden", "Only the author can submit a draft.")
        if kind != "submit" and lesson["status"] != "in_review":
            raise ApiError(409, "conflict", "The lesson must be in review first.")
        if kind == "approve":
            ensure_approved(lesson, self.sources)
        status = {"submit": "in_review", "approve": "published", "request_changes": "draft"}[kind]
        await self.set_lesson_status(lesson_id, status)
        await self.add_review_event(lesson_id, actor_id, kind, {"note": note})
        if kind == "approve":
            for track in self.tracks:
                if track["id"] == lesson["track"]:
                    for module in track["modules"]:
                        if module["id"] == lesson["module"] and lesson_id not in module["lessons"]:
                            module["lessons"].append(lesson_id)
        self.reload_index()
        return status

    def reload_index(self) -> None:
        lessons, sources = self.lessons, self.sources
        docs = {sid: passage_text(s) for sid, s in sources.items() if s.get("review_status") == "approved"}
        self.doc_sources = {sid: [sid] for sid in docs}
        for lesson in lessons.values():
            if lesson.get("status") == "published":
                for doc_id, content, ids in card_docs(lesson):
                    known = [i for i in ids if i in sources and sources[i].get("review_status") == "approved"]
                    if known:
                        docs[doc_id] = content
                        self.doc_sources[doc_id] = known
        self.index = BM25(docs)

    async def pending_sources(self) -> list[dict]:
        return [s for s in self.sources.values() if s.get("review_status") == "pending"]

    async def approve_source(self, source_id: str, actor_id: str | None) -> None:
        from .errors import ApiError
        if source_id not in self.sources:
            raise ApiError(404, "not_found", "Source not found.")
        self.sources[source_id] = {**self.sources[source_id], "review_status": "approved"}
        self.reload_index()

    async def ping(self) -> bool:
        return True


class PgStore:
    kind = "postgres"

    def __init__(self, pool: Any):
        self.pool = pool

    @classmethod
    async def connect(cls, dsn: str) -> "PgStore":
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
        q = "select data, status, author_id from lessons where id = $1" + ("" if include_unpublished else " and status = 'published'")
        async with self.pool.acquire() as c:
            row = await c.fetchrow(q, lesson_id)
        return {**row["data"], "status": row["status"], "author_id": str(row["author_id"]) if row["author_id"] else None} if row else None

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
                    "order by embedding OPERATOR(extensions.<=>) $1::extensions.vector limit $2", vec, k * 3)
            keyword_rows = await c.fetch(
                "select source_id, content, ts_rank(tsv, plainto_tsquery('simple', $1)) as score from source_chunks "
                "where source_id in (select id from sources where review_status = 'approved') "
                "and (lesson_id is null or lesson_id in (select id from lessons where status = 'published')) "
                "and tsv @@ plainto_tsquery('simple', $1) order by score desc limit $2",
                query, k * 3)
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

    async def review_queue(self) -> list[dict]:
        async with self.pool.acquire() as c:
            rows = await c.fetch("select data, status from lessons where status = 'in_review' order by updated_at")
        return [lesson_summary({**r["data"], "status": r["status"]}) for r in rows]

    async def set_lesson_status(self, lesson_id: str, status: str) -> bool:
        async with self.pool.acquire() as c:
            res = await c.execute(
                "update lessons set status = $2, data = jsonb_set(data, '{status}', to_jsonb($2::text)), updated_at = now() "
                "where id = $1", lesson_id, status)
        return res == "UPDATE 1"

    async def add_review_event(self, lesson_id: str, actor_id: str | None, kind: str, payload: dict) -> None:
        async with self.pool.acquire() as c:
            await c.execute("insert into review_events (lesson_id, actor_id, kind, payload) values ($1, $2, $3, $4)",
                            lesson_id, uuid.UUID(actor_id) if actor_id else None, kind, payload)

    async def log_tutor(self, tier: str, citation_ids: list[str], latency_ms: int, track: str | None) -> None:
        async with self.pool.acquire() as c:
            await c.execute("insert into tutor_logs (tier, citation_ids, latency_ms, track) values ($1, $2, $3, $4)",
                            tier, citation_ids, latency_ms, track)

    async def get_role(self, user_id: str) -> str | None:
        async with self.pool.acquire() as c:
            return await c.fetchval("select role from profiles where id = $1", uuid.UUID(user_id))

    async def content_bundle(self) -> dict:
        async with self.pool.acquire() as c:
            tracks = await c.fetchval("select data from app_config where key = 'tracks'") or []
            rows = await c.fetch("select data, status from lessons where status = 'published'")
            sources = await c.fetch("select id from sources")
        return {"tracks": tracks,
                "lessons": {r["data"]["id"]: {**r["data"], "status": r["status"]} for r in rows},
                "sources": await self.get_sources([r["id"] for r in sources])}

    async def staff_lessons(self, user_id: str | None, reviewer: bool) -> list[dict]:
        async with self.pool.acquire() as c:
            rows = await c.fetch("select data, status, author_id from lessons where $2::boolean or author_id = $1::uuid order by updated_at desc",
                                 uuid.UUID(user_id) if user_id else None, reviewer)
        return [{**r["data"], "status": r["status"], "author_id": str(r["author_id"]) if r["author_id"] else None} for r in rows]

    async def save_draft(self, draft: dict, actor_id: str | None, reviewer: bool) -> None:
        from .errors import ApiError
        if not actor_id:
            raise ApiError(401, "unauthorized", "A real user session is required for database writes.")
        async with self.pool.acquire() as c:
            async with c.transaction():
                # Conditional upsert also enforces ownership if two authors create the same id concurrently.
                row = await c.fetchrow(
                    "insert into lessons (id, track, module, status, data, author_id) values ($1, $2, $3, 'draft', $4, $5::uuid) "
                    "on conflict (id) do update set track = excluded.track, module = excluded.module, "
                    "status = 'draft', data = excluded.data, updated_at = now() "
                    "where lessons.status <> 'published' and ($6::boolean or lessons.author_id = $5::uuid) returning id",
                    draft["id"], draft["track"], draft["module"], {**draft, "status": "draft"}, uuid.UUID(actor_id), reviewer)
                if not row:
                    raise ApiError(403, "forbidden", "Only your unpublished drafts can be edited.")

    async def transition_lesson(self, lesson_id: str, actor_id: str | None, kind: str, note: str = "") -> str:
        from .errors import ApiError
        async with self.pool.acquire() as c:
            async with c.transaction():
                row = await c.fetchrow("select data, status, author_id from lessons where id = $1 for update", lesson_id)
                if not row:
                    raise ApiError(404, "not_found", "Lesson not found.")
                if kind == "submit" and (str(row["author_id"]) != actor_id or row["status"] != "draft"):
                    raise ApiError(403, "forbidden", "Only the author can submit a draft.")
                if kind != "submit" and row["status"] != "in_review":
                    raise ApiError(409, "conflict", "The lesson must be in review first.")
                if kind == "approve":
                    from .retrieval import lesson_source_ids
                    ids = lesson_source_ids(row["data"])
                    sources = await c.fetch("select id, review_status from sources where id = any($1::text[]) for share", ids)
                    ensure_approved(row["data"], {s["id"]: dict(s) for s in sources})
                    # Ensure newly published lessons appear in their existing curriculum module.
                    config = await c.fetchval("select data from app_config where key = 'tracks' for update") or []
                    module = next((m for t in config if t["id"] == row["data"]["track"]
                                   for m in t["modules"] if m["id"] == row["data"]["module"]), None)
                    if module is None:
                        raise ApiError(400, "bad_request", "Choose an existing track and module.")
                    if lesson_id not in module["lessons"]:
                        module["lessons"].append(lesson_id)
                    await c.execute("update app_config set data = $1, updated_at = now() where key = 'tracks'", config)
                    for doc_id, content, source_ids in card_docs(row["data"]):
                        await c.execute("insert into source_chunks (id, source_id, lesson_id, lang, content) values ($1, $2, $3, 'mixed', $4) "
                                        "on conflict (id) do update set content = excluded.content, source_id = excluded.source_id, embedding = null",
                                        doc_id, source_ids[0], lesson_id, content)
                status = {"submit": "in_review", "approve": "published", "request_changes": "draft"}[kind]
                await c.execute("update lessons set status = $2, data = jsonb_set(data, '{status}', to_jsonb($2::text)), updated_at = now() where id = $1", lesson_id, status)
                await c.execute("insert into review_events (lesson_id, actor_id, kind, payload) values ($1, $2, $3, $4)",
                                lesson_id, uuid.UUID(actor_id) if actor_id else None, kind, {"note": note})
                return status

    async def pending_sources(self) -> list[dict]:
        async with self.pool.acquire() as c:
            rows = await c.fetch("select * from sources where review_status = 'pending' order by id")
        return [dict(r) for r in rows]

    async def approve_source(self, source_id: str, actor_id: str | None) -> None:
        from .errors import ApiError
        async with self.pool.acquire() as c:
            async with c.transaction():
                result = await c.execute("update sources set review_status = 'approved', updated_at = now() where id = $1", source_id)
                if result != "UPDATE 1":
                    raise ApiError(404, "not_found", "Source not found.")
                await c.execute("insert into source_review_events (source_id, actor_id) values ($1, $2)", source_id,
                                uuid.UUID(actor_id) if actor_id else None)

    async def ping(self) -> bool:
        try:
            async with self.pool.acquire() as c:
                return await c.fetchval("select 1") == 1
        except Exception:
            return False


_store: Store | None = None


async def init_store() -> Store:
    global _store
    s = get_settings()
    if s.env == "prod" and (not s.database_url or not s.supabase_url):
        raise RuntimeError("Production requires DATABASE_URL and SUPABASE_URL; memory storage is for local development only.")
    _store = await PgStore.connect(s.database_url) if s.database_url else MemoryStore(s.content_dir)
    return _store


def get_store() -> Store:
    if _store is None:
        raise RuntimeError("store not initialised")
    return _store


def set_store(store: Store) -> None:
    global _store
    _store = store
