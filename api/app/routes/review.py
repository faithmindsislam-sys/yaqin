from typing import Any, Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from .. import review
from ..auth import User, require_role
from ..db import get_store
from ..errors import ApiError
from ..ratelimit import limit

router = APIRouter(prefix="/review")


class Decision(BaseModel):
    decision: Literal["approve", "request_changes"]
    note: str = Field(default="", max_length=4000)


@router.post("/check", dependencies=[Depends(limit)])
async def check(draft: dict[str, Any], user: User = Depends(require_role("instructor"))):
    if not isinstance(draft.get("cards"), list):
        raise ApiError(400, "bad_request", "A lesson draft needs a 'cards' list.")
    result = await review.check(get_store(), draft)
    if draft.get("id"):
        await get_store().add_review_event(draft["id"], user.id, "ai_check", {
            "ready": result["ready_for_reviewer"], "issues": len(result["issues"])})
    return result


@router.get("/queue")
async def queue(_: User = Depends(require_role("instructor"))):
    return await get_store().review_queue()


@router.post("/{lesson_id}/decision")
async def decide(lesson_id: str, body: Decision, user: User = Depends(require_role("reviewer"))):
    store = get_store()
    status = "published" if body.decision == "approve" else "draft"
    if not await store.set_lesson_status(lesson_id, status):
        raise ApiError(404, "not_found", f"No lesson '{lesson_id}'.")
    await store.add_review_event(lesson_id, user.id, body.decision, {"note": body.note})
    return {"lesson_id": lesson_id, "status": status}
