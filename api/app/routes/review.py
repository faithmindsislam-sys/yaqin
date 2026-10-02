from typing import Any, Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from .. import review
from ..auth import User, require_role
from ..db import get_store
from ..errors import ApiError
from ..lesson_model import LessonDraft
from ..ratelimit import limit
from ..retrieval import lesson_source_ids

router = APIRouter(prefix="/review")


class Decision(BaseModel):
    decision: Literal["approve", "request_changes"]
    note: str = Field(default="", max_length=4000)


@router.post("/check", dependencies=[Depends(limit)])
async def check(draft: dict[str, Any], _: User = Depends(require_role("instructor"))):
    if not isinstance(draft.get("cards"), list) or not all(isinstance(c, dict) for c in draft["cards"]):
        raise ApiError(400, "bad_request", "A lesson draft needs a 'cards' list of objects.")
    # An unsaved draft has no lesson row to attach a foreign-key review event to.
    return await review.check(get_store(), draft)


@router.get("/lessons")
async def staff_lessons(user: User = Depends(require_role("instructor"))):
    return await get_store().staff_lessons(user.id, user.role == "reviewer")


@router.post("/drafts")
async def save_draft(body: LessonDraft, user: User = Depends(require_role("instructor"))):
    draft = body.model_dump(exclude_none=True)
    store = get_store()
    tracks = await store.list_tracks()
    if not any(t["id"] == draft["track"] and any(m["id"] == draft["module"] for m in t["modules"]) for t in tracks):
        raise ApiError(400, "bad_request", "Choose an existing track and module.")
    ids = lesson_source_ids(draft)
    sources = await store.get_sources(ids)
    if any(sid not in sources for sid in ids):
        raise ApiError(400, "bad_request", "The draft cites an unknown source.")
    await store.save_draft(draft, user.id, user.role == "reviewer")
    return {"lesson_id": draft["id"], "status": "draft"}


@router.post("/{lesson_id}/submit", dependencies=[Depends(limit)])
async def submit(lesson_id: str, user: User = Depends(require_role("instructor"))):
    store = get_store()
    own = await store.staff_lessons(user.id, False)
    draft = next((l for l in own if l["id"] == lesson_id), None)
    if draft is None:
        raise ApiError(403, "forbidden", "Only the author can submit a draft.")
    checked = await review.check(store, draft)
    if not checked["ready_for_reviewer"]:
        raise ApiError(409, "needs_changes", "Resolve the high-severity review issues before submitting.")
    status = await store.transition_lesson(lesson_id, user.id, "submit")
    return {"lesson_id": lesson_id, "status": status}


@router.get("/queue")
async def queue(user: User = Depends(require_role("instructor"))):
    lessons = await get_store().staff_lessons(user.id, user.role == "reviewer")
    return [l for l in lessons if l["status"] == "in_review"]


@router.get("/sources")
async def pending_sources(_: User = Depends(require_role("instructor"))):
    return await get_store().pending_sources()


@router.post("/sources/{source_id}/approve")
async def approve_source(source_id: str, user: User = Depends(require_role("reviewer"))):
    await get_store().approve_source(source_id, user.id)
    return {"source_id": source_id, "review_status": "approved"}


@router.post("/{lesson_id}/decision", dependencies=[Depends(limit)])
async def decide(lesson_id: str, body: Decision, user: User = Depends(require_role("reviewer"))):
    store = get_store()
    if body.decision == "approve":
        draft = await store.get_lesson(lesson_id, include_unpublished=True)
        if draft is None:
            raise ApiError(404, "not_found", "Lesson not found.")
        result = await review.check(store, draft)
        if not result["ready_for_reviewer"]:
            raise ApiError(409, "needs_changes", "Resolve the high-severity review issues before publishing.")
    status = await store.transition_lesson(lesson_id, user.id, body.decision, body.note)
    return {"lesson_id": lesson_id, "status": status}
