"""Lesson authoring, scholarly review and curriculum use cases."""

from typing import Any

from app.agents.review.agent import ReviewAgent
from app.domain.errors import ApiError
from app.domain.lessons import ensure_approved, lesson_source_ids
from app.domain.users import User, has_role
from app.gateways.quran_gateway import QuranGateway
from app.repositories.repository import Repository


def planned_permission(user: User) -> None:
    if not has_role(user, "admin"):
        raise ApiError(403, "forbidden", "An admin must manage Coming soon titles.")


class LessonService:
    def __init__(self, repository: Repository, reviewer: ReviewAgent, quran: QuranGateway):
        self.repository = repository
        self.reviewer = reviewer
        self.quran = quran

    async def check(self, draft: dict[str, Any]) -> dict:
        if not isinstance(draft.get("cards"), list) or not all(isinstance(c, dict) for c in draft["cards"]):
            raise ApiError(400, "bad_request", "A lesson draft needs a 'cards' list of objects.")
        # Unsaved drafts have no lesson row to attach a foreign-key review event to.
        return await self.reviewer.check(draft)

    async def staff_lessons(self, user: User) -> list[dict]:
        return await self.repository.staff_lessons(user.id, has_role(user, "admin"))

    async def history(self, lesson_id: str, user: User) -> list[dict]:
        if not any(lesson["id"] == lesson_id for lesson in await self.staff_lessons(user)):
            raise ApiError(404, "not_found", "Lesson not found.")
        return await self.repository.lesson_history(lesson_id)

    async def save_draft(self, draft: dict, user: User) -> dict:
        tracks = await self.repository.list_tracks()
        if not any(t["id"] == draft["track"] and any(m["id"] == draft["module"] for m in t["modules"]) for t in tracks):
            raise ApiError(400, "bad_request", "Choose an existing track and module.")
        ids = lesson_source_ids(draft)
        sources = await self.repository.get_sources(ids)
        if any(sid not in sources for sid in ids):
            raise ApiError(400, "bad_request", "The draft cites an unknown source.")
        # Preserve existing credits and add the saving account's email, ignoring editor-supplied credits.
        old = await self.repository.get_lesson(draft["id"], include_unpublished=True)
        account = (await self.repository.get_account(user.id) if user.id else None) or {}
        names = [name for name in (old or {}).get("contributors") or [] if name != account.get("display_name")]
        email = account.get("email")
        if email and email not in names and len(names) < 20:
            names.append(email)
        draft.pop("contributors", None)
        if names:
            draft["contributors"] = names
        await self.repository.save_draft(draft, user.id, has_role(user, "admin"))
        return {"lesson_id": draft["id"], "status": "draft", "contributors": names}

    async def submit(self, lesson_id: str, user: User) -> dict:
        reviewer = has_role(user, "admin")
        draft = next((lesson for lesson in await self.staff_lessons(user) if lesson["id"] == lesson_id), None)
        if draft is None:
            raise ApiError(403, "forbidden", "Only the author or an admin can submit a draft.")
        checked = await self.reviewer.check(draft)
        if not checked["ready_for_reviewer"]:
            raise ApiError(409, "needs_changes", "Resolve the high-severity review issues before submitting.")
        ensure_approved(draft, await self.repository.get_sources(lesson_source_ids(draft)), approved=False)
        status = await self.repository.transition_lesson(
            lesson_id, user.id, "submit", reviewer=reviewer, expected=draft
        )
        return {"lesson_id": lesson_id, "status": status}

    async def queue(self, user: User) -> list[dict]:
        return [lesson for lesson in await self.staff_lessons(user) if lesson["status"] == "in_review"]

    async def quran_source(self, surah: int, ayah: int) -> dict:
        source = self.quran.ayah_source(surah, ayah)
        if source is None:
            raise ApiError(404, "not_found", "The Qur'an has no such verse.")
        return await self.repository.add_source(source)

    async def decide(self, lesson_id: str, decision: str, note: str, user: User) -> dict:
        if not has_role(user, "admin"):
            raise ApiError(403, "forbidden", "An admin must review this lesson.")
        draft = None
        if decision == "approve":
            draft = await self.repository.get_lesson(lesson_id, include_unpublished=True)
            if draft is None:
                raise ApiError(404, "not_found", "Lesson not found.")
            result = await self.reviewer.check(draft)
            if not result["ready_for_reviewer"]:
                raise ApiError(409, "needs_changes", "Resolve the high-severity review issues before publishing.")
        status = await self.repository.transition_lesson(
            lesson_id, user.id, decision, note, reviewer=True, expected=draft
        )
        return {"lesson_id": lesson_id, "status": status}

    async def archive(self, lesson_id: str, user: User) -> dict:
        await self.repository.archive_lesson(lesson_id, user.id, has_role(user, "admin"))
        return {"lesson_id": lesson_id, "status": "archived"}

    async def unpublish(self, lesson_id: str, user: User) -> dict:
        await self.repository.unpublish_lesson(lesson_id, user.id, has_role(user, "admin"))
        return {"lesson_id": lesson_id, "status": "draft"}

    async def delete(self, lesson_id: str, user: User) -> dict:
        await self.repository.delete_lesson(lesson_id, user.id, has_role(user, "admin"))
        return {"lesson_id": lesson_id, "deleted": True}

    async def add_planned(self, track: str, module: str, title: dict, user: User) -> dict:
        planned_permission(user)
        await self.repository.change_planned(track, module, user.id, title=title)
        return {"added": True}

    async def remove_planned(self, track: str, module: str, index: int, user: User) -> dict:
        planned_permission(user)
        await self.repository.change_planned(track, module, user.id, index=index)
        return {"removed": True}

    async def pending_sources(self) -> list[dict]:
        return await self.repository.pending_sources()

    async def approve_source(self, source_id: str, user: User) -> dict:
        await self.repository.approve_source(source_id, user.id)
        return {"source_id": source_id, "review_status": "approved"}
