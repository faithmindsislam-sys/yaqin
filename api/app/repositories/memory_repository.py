"""MemoryRepository storage implementation."""

from __future__ import annotations

import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

from app.domain.errors import ApiError
from app.domain.lessons import (
    card_docs,
    check_owner,
    edit_planned,
    ensure_approved,
    tracks_with_lessons,
)
from app.domain.search import Hit
from app.domain.sources import passage_text

from .content_files import load_content
from .keyword_index import BM25


class MemoryRepository:
    kind = "memory"

    def __init__(self, content_dir: Path):
        self.content_dir = content_dir
        self.reload()
        self.events: list[dict] = []
        self.logs: list[dict] = []
        self.roles: dict[str, str] = {}
        self.users: dict[str, dict] = {}
        self.admin_events: list[dict] = []
        self.progress: dict[tuple[str, str], dict] = {}

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

    async def _set_lesson_status(self, lesson_id: str, status: str) -> bool:
        if lesson_id not in self.lessons:
            return False
        self.lessons[lesson_id] = {**self.lessons[lesson_id], "status": status}
        return True

    async def add_review_event(self, lesson_id: str, actor_id: str | None, kind: str, payload: dict) -> None:
        self.events.append(
            {
                "id": str(uuid.uuid4()),
                "lesson_id": lesson_id,
                "actor_id": actor_id,
                "kind": kind,
                "payload": payload,
                "created_at": time.time(),
            }
        )

    async def log_tutor(self, tier: str, citation_ids: list[str], latency_ms: int, track: str | None) -> None:
        self.logs.append({"tier": tier, "citation_ids": citation_ids, "latency_ms": latency_ms, "track": track})

    async def get_role(self, user_id: str) -> str | None:
        return self.users[user_id]["role"] if user_id in self.users else self.roles.get(user_id, "learner")

    async def get_account(self, user_id: str) -> dict | None:
        user = self.users.get(user_id)
        return user and {"email": user.get("email"), "display_name": user.get("display_name")}

    async def search_users(self, query: str) -> list[dict]:
        rows = [
            u
            for u in self.users.values()
            if query.lower() in (u.get("email") or "").lower() or query.lower() in (u.get("display_name") or "").lower()
        ]
        return [dict(u) for u in sorted(rows, key=lambda u: (u["created_at"], u["id"]), reverse=True)[:50]]

    async def set_user_role(self, user_id: str, role: str, actor_id: str) -> None:
        if user_id not in self.users:
            raise ApiError(404, "not_found", "User not found.")
        old = self.users[user_id]["role"]
        # No awaits between the update and audit append: one atomic memory operation.
        self.users[user_id] = {**self.users[user_id], "role": role}
        self.roles[user_id] = role
        self.admin_events.append(
            {
                "id": str(uuid.uuid4()),
                "actor_id": actor_id,
                "target_id": user_id,
                "kind": "role_changed",
                "payload": {"from_role": old, "to_role": role},
                "created_at": time.time(),
            }
        )

    async def content_bundle(self) -> dict:
        return {
            "tracks": self.tracks,
            "lessons": {i: lesson for i, lesson in self.lessons.items() if lesson.get("status") == "published"},
            "sources": self.sources,
        }

    async def staff_lessons(self, user_id: str | None, reviewer: bool) -> list[dict]:
        return [lesson for lesson in self.lessons.values() if reviewer or lesson.get("author_id") == user_id]

    async def save_draft(self, draft: dict, actor_id: str | None, reviewer: bool) -> None:
        old = self.lessons.get(draft["id"])
        if old and (old.get("status") == "published" or (not reviewer and old.get("author_id") != actor_id)):
            raise ApiError(403, "forbidden", "Only your unpublished drafts can be edited.")
        self.lessons[draft["id"]] = {**draft, "status": "draft", "author_id": old.get("author_id") if old else actor_id}
        await self.add_review_event(draft["id"], actor_id, "updated" if old else "created", {})

    async def lesson_history(self, lesson_id: str) -> list[dict]:
        return [
            {
                "id": e["id"],
                "kind": e["kind"],
                "payload": e["payload"],
                "actor_id": e["actor_id"],
                "actor_name": self.users.get(e["actor_id"], {}).get("display_name"),
                "actor_email": self.users.get(e["actor_id"], {}).get("email"),
                "created_at": datetime.fromtimestamp(e["created_at"], timezone.utc).isoformat(),
            }
            for e in reversed(self.events)
            if e["lesson_id"] == lesson_id
        ]

    async def archive_lesson(self, lesson_id: str, actor_id: str | None, reviewer: bool) -> None:
        lesson = self.lessons.get(lesson_id)
        if not lesson:
            raise ApiError(404, "not_found", "Lesson not found.")
        check_owner(lesson, actor_id, reviewer)
        if lesson["status"] == "archived":
            raise ApiError(409, "conflict", "This lesson is already archived.")
        await self._set_lesson_status(lesson_id, "archived")
        await self.add_review_event(lesson_id, actor_id, "archived", {})
        self.reload_index()

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
        lesson = self.lessons.get(lesson_id)
        if not lesson:
            raise ApiError(404, "not_found", "Lesson not found.")
        if expected is not None and lesson != expected:
            raise ApiError(409, "conflict", "The lesson changed during checks. Try again.")
        if kind != "submit" and not reviewer:
            raise ApiError(403, "forbidden", "An admin must review this lesson.")
        if kind == "submit" and ((not reviewer and lesson.get("author_id") != actor_id) or lesson["status"] != "draft"):
            raise ApiError(403, "forbidden", "Only the author or an admin can submit a draft.")
        if kind != "submit" and lesson["status"] != "in_review":
            raise ApiError(409, "conflict", "The lesson must be in review first.")
        if kind == "approve":
            ensure_approved(lesson, self.sources)
        status = {"submit": "in_review", "approve": "published", "request_changes": "draft"}[kind]
        await self._set_lesson_status(lesson_id, status)
        await self.add_review_event(
            lesson_id, actor_id, kind, {"note": note, "reviewed": reviewer} if kind == "approve" else {"note": note}
        )
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

    async def unpublish_lesson(self, lesson_id: str, actor_id: str | None, reviewer: bool) -> None:
        lesson = self.lessons.get(lesson_id)
        if not lesson:
            raise ApiError(404, "not_found", "Lesson not found.")
        check_owner(lesson, actor_id, reviewer)
        if lesson["status"] != "published":
            raise ApiError(409, "conflict", "Only published lessons can be hidden.")
        await self._set_lesson_status(lesson_id, "draft")
        await self.add_review_event(lesson_id, actor_id, "unpublish", {})
        self.reload_index()

    async def delete_lesson(self, lesson_id: str, actor_id: str | None, reviewer: bool) -> None:
        lesson = self.lessons.get(lesson_id)
        if not lesson:
            raise ApiError(404, "not_found", "Lesson not found.")
        check_owner(lesson, actor_id, reviewer)
        if lesson["status"] != "draft":
            raise ApiError(409, "conflict", "Only draft lessons can be deleted. Hide it first.")
        if any(key[1] == lesson_id for key in self.progress):
            raise ApiError(
                409, "has_progress", "Learners have progress on this lesson. Keep it hidden instead of deleting it."
            )
        for track in self.tracks:
            for module in track["modules"]:
                module["lessons"] = [i for i in module["lessons"] if i != lesson_id]
        del self.lessons[lesson_id]
        self.events = [e for e in self.events if e["lesson_id"] != lesson_id]
        self.admin_events.append(
            {"actor_id": actor_id, "kind": "lesson_deleted", "payload": {"id": lesson_id, "title": lesson["title"]}}
        )
        self.reload_index()

    async def change_planned(
        self, track: str, module: str, actor_id: str | None, *, title: dict | None = None, index: int | None = None
    ) -> None:
        kind, payload = edit_planned(self.tracks, track, module, title, index)
        self.admin_events.append({"actor_id": actor_id, "kind": kind, "payload": payload})

    async def pending_sources(self) -> list[dict]:
        return [s for s in self.sources.values() if s.get("review_status") == "pending"]

    async def add_source(self, source: dict) -> dict:
        return self.sources.setdefault(source["id"], source)

    async def approve_source(self, source_id: str, actor_id: str | None) -> None:
        if source_id not in self.sources:
            raise ApiError(404, "not_found", "Source not found.")
        self.sources[source_id] = {**self.sources[source_id], "review_status": "approved"}
        self.reload_index()

    async def ping(self) -> bool:
        return True

    async def close(self) -> None:
        pass
