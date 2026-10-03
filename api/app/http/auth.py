"""HTTP session dependencies; role decisions use persisted backend profiles."""

import uuid

from fastapi import Depends, Request

from app.configuration.settings import get_settings
from app.dependencies import get_repository, get_token_gateway
from app.domain.errors import ApiError
from app.domain.users import ANONYMOUS, User, has_role
from app.gateways.token_gateway import InvalidSessionToken, TokenGateway
from app.repositories.repository import Repository


async def current_user(
    request: Request,
    repository: Repository = Depends(get_repository),
    tokens: TokenGateway = Depends(get_token_gateway),
) -> User:
    header = request.headers.get("authorization", "")
    if not header.lower().startswith("bearer "):
        s = get_settings()
        if s.env == "local" and s.dev_role:
            return User(id=None, role=s.dev_role)
        return ANONYMOUS
    token = header.split(" ", 1)[1].strip()
    try:
        claims = await tokens.decode_token(token)
        uuid.UUID(claims["sub"])
    except (InvalidSessionToken, ValueError, TypeError) as e:
        raise ApiError(401, "unauthorized", f"Invalid session token: {e}") from e
    user_id = claims.get("sub")
    role = await repository.get_role(user_id) if user_id else None
    return User(id=user_id, role=role or "learner", email=claims.get("email"))


def require_role(minimum: str):
    async def dep(user: User = Depends(current_user)) -> User:
        if user.role == "anonymous":
            raise ApiError(401, "unauthorized", "Sign in to continue.")
        if not has_role(user, minimum):
            raise ApiError(403, "forbidden", f"This needs the {minimum} role.")
        return user

    return dep
