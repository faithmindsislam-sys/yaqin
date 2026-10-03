from typing import Any

from fastapi import APIRouter, Depends

from app.contracts.lesson import LessonDraft
from app.contracts.review import AyahRef, Decision, PlannedAdd, PlannedRemove
from app.dependencies import get_lesson_service
from app.domain.users import User
from app.http.auth import require_role
from app.http.rate_limit import limit
from app.services.lesson_service import LessonService

router = APIRouter(prefix="/review")


@router.post("/check", dependencies=[Depends(limit)])
async def check(
    draft: dict[str, Any],
    _: User = Depends(require_role("teacher")),
    service: LessonService = Depends(get_lesson_service),
):
    return await service.check(draft)


@router.get("/lessons")
async def staff_lessons(
    user: User = Depends(require_role("teacher")), service: LessonService = Depends(get_lesson_service)
):
    return await service.staff_lessons(user)


@router.get("/{lesson_id}/history")
async def history(
    lesson_id: str, user: User = Depends(require_role("teacher")), service: LessonService = Depends(get_lesson_service)
):
    return await service.history(lesson_id, user)


@router.post("/{lesson_id}/archive")
async def archive(
    lesson_id: str, user: User = Depends(require_role("teacher")), service: LessonService = Depends(get_lesson_service)
):
    return await service.archive(lesson_id, user)


@router.post("/drafts")
async def save_draft(
    body: LessonDraft,
    user: User = Depends(require_role("teacher")),
    service: LessonService = Depends(get_lesson_service),
):
    return await service.save_draft(body.model_dump(exclude_none=True), user)


@router.post("/{lesson_id}/submit", dependencies=[Depends(limit)])
async def submit(
    lesson_id: str, user: User = Depends(require_role("teacher")), service: LessonService = Depends(get_lesson_service)
):
    return await service.submit(lesson_id, user)


@router.get("/queue")
async def queue(user: User = Depends(require_role("teacher")), service: LessonService = Depends(get_lesson_service)):
    return await service.queue(user)


@router.get("/sources")
async def pending_sources(
    _: User = Depends(require_role("teacher")), service: LessonService = Depends(get_lesson_service)
):
    return await service.pending_sources()


@router.post("/sources/quran")
async def quran_source(
    body: AyahRef, _: User = Depends(require_role("teacher")), service: LessonService = Depends(get_lesson_service)
):
    """Puts one verse in the source library, word for word from the bundled Qur'an, and returns the library entry."""
    return await service.quran_source(body.surah, body.ayah)


@router.post("/sources/{source_id}/approve")
async def approve_source(
    source_id: str, user: User = Depends(require_role("admin")), service: LessonService = Depends(get_lesson_service)
):
    return await service.approve_source(source_id, user)


@router.post("/{lesson_id}/decision", dependencies=[Depends(limit)])
async def decide(
    lesson_id: str,
    body: Decision,
    user: User = Depends(require_role("teacher")),
    service: LessonService = Depends(get_lesson_service),
):
    return await service.decide(lesson_id, body.decision, body.note, user)


@router.post("/{lesson_id}/unpublish")
async def unpublish(
    lesson_id: str, user: User = Depends(require_role("teacher")), service: LessonService = Depends(get_lesson_service)
):
    return await service.unpublish(lesson_id, user)


@router.post("/{lesson_id}/delete")
async def delete(
    lesson_id: str, user: User = Depends(require_role("teacher")), service: LessonService = Depends(get_lesson_service)
):
    return await service.delete(lesson_id, user)


@router.post("/planned")
async def add_planned(
    body: PlannedAdd,
    user: User = Depends(require_role("teacher")),
    service: LessonService = Depends(get_lesson_service),
):
    return await service.add_planned(body.track, body.module, body.title.model_dump(), user)


@router.post("/planned/remove")
async def remove_planned(
    body: PlannedRemove,
    user: User = Depends(require_role("teacher")),
    service: LessonService = Depends(get_lesson_service),
):
    return await service.remove_planned(body.track, body.module, body.index, user)
