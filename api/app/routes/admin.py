from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from ..auth import User, require_role
from ..db import get_store
from ..errors import ApiError

router = APIRouter(prefix="/admin", dependencies=[Depends(require_role("super_admin"))])


class RoleChange(BaseModel):
    role: Literal["learner", "teacher", "admin", "super_admin"]


@router.get("/users")
async def users(q: str = ""):
    return await get_store().search_users(q.strip())


@router.post("/users/{user_id}/role")
async def change_role(user_id: UUID, body: RoleChange, user: User = Depends(require_role("super_admin"))):
    if not user.id:
        raise ApiError(401, "unauthorized", "A real user session is required for role changes.")
    if UUID(user.id) == user_id:
        raise ApiError(403, "forbidden", "You cannot change your own role.")
    await get_store().set_user_role(str(user_id), body.role, user.id)
    return {"id": str(user_id), "role": body.role}
