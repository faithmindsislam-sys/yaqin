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


def passage_text(source: dict) -> str:
    return " ".join(x for x in (source.get("ref_en"), source.get("ref_ar"), source.get("text_en"), source.get("text_ar")) if x)


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
        docs = {sid: passage_text(s) for sid, s in self.sources.items()}
        self.doc_sources: dict[str, list[str]] = {sid: [sid] for sid in docs}
        for lesson in self.lessons.values():
            if lesson.get("status") != "published":
                continue
            for doc_id, text, ids in card_docs(lesson):
                known = [i for i in ids if i in self.sources]
                if known:
                    docs[doc_id] = text
                    self.doc_sources[doc_id] = known
        self.index = BM25(docs)

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
        q = "select data, status from lessons where id = $1" + ("" if include_unpublished else " and status = 'published'")
        async with self.pool.acquire() as c:
            row = await c.fetchrow(q, lesson_id)
        return {**row["data"], "status": row["status"]} if row else None

    async def get_sources(self, ids: list[str]) -> dict[str, dict]:
        if not ids:
            return {}
        async with self.pool.acquire() as c:
            rows = await c.fetch(
                "select id, kind, ref_en, ref_ar, text_ar, text_en, translation, origin, url, grading, review_status "
                "from sources where id = any($1::text[])", ids)
        return {r["id"]: dict(r) for r in rows}

    async def search(self, query: str, *, k: int, embedding: list[float] | None = None) -> list[Hit]:
        async with self.pool.acquire() as c:
            if embedding is not None:
                vec = "[" + ",".join(f"{x:.6f}" for x in embedding) + "]"
                rows = await c.fetch(
                    "select source_id, content, 1 - (embedding <=> $1::vector) as score from source_chunks "
                    "where source_id is not null order by embedding <=> $1::vector limit $2", vec, k * 3)
            else:
                rows = await c.fetch(
                    "select source_id, content, ts_rank(tsv, plainto_tsquery('simple', $1)) as score from source_chunks "
                    "where source_id is not null and tsv @@ plainto_tsquery('simple', $1) order by score desc limit $2",
                    query, k * 3)
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
        return res.endswith("1")

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
    _store = await PgStore.connect(s.database_url) if s.database_url else MemoryStore(s.content_dir)
    return _store


def get_store() -> Store:
    if _store is None:
        raise RuntimeError("store not initialised")
    return _store


def set_store(store: Store) -> None:
    global _store
    _store = store
