from fastapi import APIRouter, Depends, Response

from ..auth import User, current_user, has_role
from ..db import get_store
from ..errors import ApiError
from ..retrieval import lesson_source_ids

router = APIRouter()


def public_lesson(lesson: dict) -> dict:
    """Contributors are staff email addresses: they stay in Studio and never reach learner responses."""
    return {k: v for k, v in lesson.items() if k != "contributors"}


@router.get("/content")
async def content_bundle(response: Response):
    response.headers["Cache-Control"] = "no-store"
    bundle = await get_store().content_bundle()
    return {**bundle, "lessons": {i: public_lesson(l) for i, l in bundle["lessons"].items()}}


@router.get("/tracks")
async def tracks():
    return await get_store().list_tracks()


@router.get("/lessons/{lesson_id}")
async def lesson(lesson_id: str, user: User = Depends(current_user)):
    store = get_store()
    staff = has_role(user, "teacher")
    data = await store.get_lesson(lesson_id, include_unpublished=staff)
    if data is None or (data.get("status") != "published" and not has_role(user, "admin") and data.get("author_id") != user.id):
        raise ApiError(404, "not_found", f"No lesson '{lesson_id}'.")
    return {**(data if staff else public_lesson(data)), "sources_by_id": await store.get_sources(lesson_source_ids(data))}


@router.get("/sources/{source_id}")
async def source(source_id: str):
    found = await get_store().get_sources([source_id])
    if source_id not in found:
        raise ApiError(404, "not_found", f"No source '{source_id}'.")
    return found[source_id]
