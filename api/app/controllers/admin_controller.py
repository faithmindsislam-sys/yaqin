from uuid import UUID

from fastapi import APIRouter, Depends

from app.contracts.admin import RoleChange
from app.dependencies import get_user_service
from app.domain.users import User
from app.http.auth import require_role
from app.services.user_service import UserService

router = APIRouter(prefix="/admin", dependencies=[Depends(require_role("super_admin"))])


@router.get("/users")
async def users(q: str = "", service: UserService = Depends(get_user_service)):
    return await service.users(q)


@router.post("/users/{user_id}/role")
async def change_role(
    user_id: UUID,
    body: RoleChange,
    user: User = Depends(require_role("super_admin")),
    service: UserService = Depends(get_user_service),
):
    return await service.change_role(user_id, body.role, user)
