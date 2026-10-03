"""Public content and authorized lesson reads."""

from app.domain.errors import ApiError
from app.domain.lessons import lesson_source_ids
from app.domain.users import User, has_role
from app.repositories.repository import Repository


def public_lesson(lesson: dict) -> dict:
    """Staff email credits never reach learner responses."""
    return {k: v for k, v in lesson.items() if k != "contributors"}


class ContentService:
    def __init__(self, repository: Repository):
        self.repository = repository

    async def content_bundle(self) -> dict:
        bundle = await self.repository.content_bundle()
        return {**bundle, "lessons": {i: public_lesson(lesson) for i, lesson in bundle["lessons"].items()}}

    async def lesson(self, lesson_id: str, user: User) -> dict:
        staff = has_role(user, "teacher")
        data = await self.repository.get_lesson(lesson_id, include_unpublished=staff)
        if data is None or (
            data.get("status") != "published" and not has_role(user, "admin") and data.get("author_id") != user.id
        ):
            raise ApiError(404, "not_found", f"No lesson '{lesson_id}'.")
        return {
            **(data if staff else public_lesson(data)),
            "sources_by_id": await self.repository.get_sources(lesson_source_ids(data)),
        }

    async def source(self, source_id: str) -> dict:
        found = await self.repository.get_sources([source_id])
        if source_id not in found:
            raise ApiError(404, "not_found", f"No source '{source_id}'.")
        return found[source_id]

    async def tracks(self) -> list[dict]:
        return await self.repository.list_tracks()
