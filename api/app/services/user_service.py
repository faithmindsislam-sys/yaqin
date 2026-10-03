"""Account administration with persisted role changes and audit events."""

from uuid import UUID

from app.domain.errors import ApiError
from app.domain.users import User
from app.repositories.repository import Repository


class UserService:
    def __init__(self, repository: Repository):
        self.repository = repository

    async def change_role(self, user_id: UUID, role: str, actor: User) -> dict:
        if not actor.id:
            raise ApiError(401, "unauthorized", "A real user session is required for role changes.")
        if UUID(actor.id) == user_id:
            raise ApiError(403, "forbidden", "You cannot change your own role.")
        await self.repository.set_user_role(str(user_id), role, actor.id)
        return {"id": str(user_id), "role": role}

    async def users(self, query: str) -> list[dict]:
        return await self.repository.search_users(query.strip())
