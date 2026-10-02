from fastapi import APIRouter, Depends

from ..auth import User, current_user
from ..db import get_store
from ..errors import ApiError
from ..retrieval import lesson_source_ids

router = APIRouter()


@router.get("/tracks")
async def tracks():
    return await get_store().list_tracks()


@router.get("/lessons/{lesson_id}")
async def lesson(lesson_id: str, user: User = Depends(current_user)):
    store = get_store()
    staff = user.role in ("instructor", "reviewer")
    data = await store.get_lesson(lesson_id, include_unpublished=staff)
    if data is None:
        raise ApiError(404, "not_found", f"No lesson '{lesson_id}'.")
    return {**data, "sources_by_id": await store.get_sources(lesson_source_ids(data))}


@router.get("/sources/{source_id}")
async def source(source_id: str):
    found = await get_store().get_sources([source_id])
    if source_id not in found:
        raise ApiError(404, "not_found", f"No source '{source_id}'.")
    return found[source_id]
