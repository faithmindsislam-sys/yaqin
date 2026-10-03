from typing import Any, Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field

from .. import review
from ..auth import User, has_role, require_role
from ..db import ensure_approved, get_store
from ..errors import ApiError
from ..lesson_model import LessonDraft
from ..quran import ayah_source
from ..ratelimit import limit
from ..retrieval import lesson_source_ids

router = APIRouter(prefix="/review")


class Decision(BaseModel):
    decision: Literal["approve", "request_changes"]
    note: str = Field(default="", max_length=4000)


@router.post("/check", dependencies=[Depends(limit)])
async def check(draft: dict[str, Any], _: User = Depends(require_role("teacher"))):
    if not isinstance(draft.get("cards"), list) or not all(isinstance(c, dict) for c in draft["cards"]):
        raise ApiError(400, "bad_request", "A lesson draft needs a 'cards' list of objects.")
    # An unsaved draft has no lesson row to attach a foreign-key review event to.
    return await review.check(get_store(), draft)


@router.get("/lessons")
async def staff_lessons(user: User = Depends(require_role("teacher"))):
    return await get_store().staff_lessons(user.id, has_role(user, "admin"))


@router.get("/{lesson_id}/history")
async def history(lesson_id: str, user: User = Depends(require_role("teacher"))):
    store = get_store()
    lessons = await store.staff_lessons(user.id, has_role(user, "admin"))
    if not any(l["id"] == lesson_id for l in lessons):
        raise ApiError(404, "not_found", "Lesson not found.")
    return await store.lesson_history(lesson_id)


@router.post("/{lesson_id}/archive")
async def archive(lesson_id: str, user: User = Depends(require_role("teacher"))):
    await get_store().archive_lesson(lesson_id, user.id, has_role(user, "admin"))
    return {"lesson_id": lesson_id, "status": "archived"}


@router.post("/drafts")
async def save_draft(body: LessonDraft, user: User = Depends(require_role("teacher"))):
    draft = body.model_dump(exclude_none=True)
    store = get_store()
    tracks = await store.list_tracks()
    if not any(t["id"] == draft["track"] and any(m["id"] == draft["module"] for m in t["modules"]) for t in tracks):
        raise ApiError(400, "bad_request", "Choose an existing track and module.")
    ids = lesson_source_ids(draft)
    sources = await store.get_sources(ids)
    if any(sid not in sources for sid in ids):
        raise ApiError(400, "bad_request", "The draft cites an unknown source.")
    # Credits are kept here, not by the editor: the entries already on the lesson, plus the email of the account that saves it.
    # Accounts were first credited by profile name: that entry gives way to the email.
    old = await store.get_lesson(draft["id"], include_unpublished=True)
    account = (await store.get_account(user.id) if user.id else None) or {}
    names = [name for name in (old or {}).get("contributors") or [] if name != account.get("display_name")]
    email = account.get("email")
    if email and email not in names and len(names) < 20:
        names.append(email)
    draft.pop("contributors", None)
    if names:
        draft["contributors"] = names
    await store.save_draft(draft, user.id, has_role(user, "admin"))
    return {"lesson_id": draft["id"], "status": "draft", "contributors": names}


@router.post("/{lesson_id}/submit", dependencies=[Depends(limit)])
async def submit(lesson_id: str, user: User = Depends(require_role("teacher"))):
    store = get_store()
    # Admins can submit any draft, so a lesson they edited (or one with no author) can be published again.
    reviewer = has_role(user, "admin")
    draft = next((l for l in await store.staff_lessons(user.id, reviewer) if l["id"] == lesson_id), None)
    if draft is None:
        raise ApiError(403, "forbidden", "Only the author or an admin can submit a draft.")
    checked = await review.check(store, draft)
    if not checked["ready_for_reviewer"]:
        raise ApiError(409, "needs_changes", "Resolve the high-severity review issues before submitting.")
    ensure_approved(draft, await store.get_sources(lesson_source_ids(draft)), approved=False)
    status = await store.transition_lesson(lesson_id, user.id, "submit", reviewer=reviewer, expected=draft)
    return {"lesson_id": lesson_id, "status": status}


@router.get("/queue")
async def queue(user: User = Depends(require_role("teacher"))):
    lessons = await get_store().staff_lessons(user.id, has_role(user, "admin"))
    return [l for l in lessons if l["status"] == "in_review"]


@router.get("/sources")
async def pending_sources(_: User = Depends(require_role("teacher"))):
    return await get_store().pending_sources()


class AyahRef(BaseModel):
    surah: int = Field(ge=1, le=114)
    ayah: int = Field(ge=1, le=286)


@router.post("/sources/quran")
async def quran_source(body: AyahRef, _: User = Depends(require_role("teacher"))):
    """Puts one verse in the source library, word for word from the bundled Qur'an, and returns the library entry."""
    source = ayah_source(body.surah, body.ayah)
    if source is None:
        raise ApiError(404, "not_found", "The Qur'an has no such verse.")
    return await get_store().add_source(source)


@router.post("/sources/{source_id}/approve")
async def approve_source(source_id: str, user: User = Depends(require_role("admin"))):
    await get_store().approve_source(source_id, user.id)
    return {"source_id": source_id, "review_status": "approved"}


@router.post("/{lesson_id}/decision", dependencies=[Depends(limit)])
async def decide(lesson_id: str, body: Decision, user: User = Depends(require_role("teacher"))):
    # Review is always on: a teacher submits, an admin decides.
    if not has_role(user, "admin"):
        raise ApiError(403, "forbidden", "An admin must review this lesson.")
    store = get_store()
    if body.decision == "approve":
        draft = await store.get_lesson(lesson_id, include_unpublished=True)
        if draft is None:
            raise ApiError(404, "not_found", "Lesson not found.")
        result = await review.check(store, draft)
        if not result["ready_for_reviewer"]:
            raise ApiError(409, "needs_changes", "Resolve the high-severity review issues before publishing.")
    status = await store.transition_lesson(lesson_id, user.id, body.decision, body.note, reviewer=True,
                                           expected=draft if body.decision == "approve" else None)
    return {"lesson_id": lesson_id, "status": status}


@router.post("/{lesson_id}/unpublish")
async def unpublish(lesson_id: str, user: User = Depends(require_role("teacher"))):
    await get_store().unpublish_lesson(lesson_id, user.id, has_role(user, "admin"))
    return {"lesson_id": lesson_id, "status": "draft"}


@router.post("/{lesson_id}/delete")
async def delete(lesson_id: str, user: User = Depends(require_role("teacher"))):
    await get_store().delete_lesson(lesson_id, user.id, has_role(user, "admin"))
    return {"lesson_id": lesson_id, "deleted": True}


class PlannedTitle(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    en: str = Field(min_length=1, max_length=200)
    ar: str = Field(min_length=1, max_length=200)


class PlannedLocation(BaseModel):
    track: Literal["explore", "first-steps", "deepen"]
    module: str = Field(min_length=1, max_length=100)


class PlannedAdd(PlannedLocation):
    title: PlannedTitle


class PlannedRemove(PlannedLocation):
    index: int = Field(ge=0)


def planned_permission(user: User) -> None:
    if not has_role(user, "admin"):
        raise ApiError(403, "forbidden", "An admin must manage Coming soon titles.")


@router.post("/planned")
async def add_planned(body: PlannedAdd, user: User = Depends(require_role("teacher"))):
    planned_permission(user)
    await get_store().change_planned(body.track, body.module, user.id, title=body.title.model_dump())
    return {"added": True}


@router.post("/planned/remove")
async def remove_planned(body: PlannedRemove, user: User = Depends(require_role("teacher"))):
    planned_permission(user)
    await get_store().change_planned(body.track, body.module, user.id, index=body.index)
    return {"removed": True}
