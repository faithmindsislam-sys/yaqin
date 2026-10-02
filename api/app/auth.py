"""Supabase JWT verification. Current projects sign with asymmetric keys (ES256)
published at the project's JWKS endpoint; HS256 with the legacy secret is kept
as an opt-in fallback."""

from __future__ import annotations

import asyncio
import uuid
from dataclasses import dataclass
from functools import lru_cache

import jwt
from fastapi import Depends, Request

from .config import get_settings
from .db import get_store
from .errors import ApiError

ROLE_RANK = {"learner": 0, "instructor": 1, "reviewer": 2}


@dataclass
class User:
    id: str | None
    role: str
    email: str | None = None


ANONYMOUS = User(id=None, role="anonymous")


@lru_cache
def _jwks() -> jwt.PyJWKClient:
    url = f"{get_settings().supabase_url.rstrip('/')}/auth/v1/.well-known/jwks.json"
    return jwt.PyJWKClient(url, cache_keys=True, lifespan=3600, timeout=10)


def _decode(token: str) -> dict:
    s = get_settings()
    header = jwt.get_unverified_header(token)
    if header.get("alg") == "HS256":
        if not s.supabase_jwt_secret or not s.supabase_url:
            raise jwt.InvalidTokenError("HS256 token but no legacy secret configured")
        return jwt.decode(token, s.supabase_jwt_secret, algorithms=["HS256"], audience="authenticated",
                          issuer=f"{s.supabase_url.rstrip('/')}/auth/v1", options={"require": ["sub", "exp", "aud", "iss"]})
    if not s.supabase_url:
        raise jwt.InvalidTokenError("SUPABASE_URL not configured")
    key = _jwks().get_signing_key_from_jwt(token)
    return jwt.decode(token, key.key, algorithms=["ES256", "RS256"], audience="authenticated",
                      issuer=f"{s.supabase_url.rstrip('/')}/auth/v1", options={"require": ["sub", "exp", "aud", "iss"]})


async def current_user(request: Request) -> User:
    header = request.headers.get("authorization", "")
    if not header.lower().startswith("bearer "):
        s = get_settings()
        if s.env == "local" and s.dev_role:
            return User(id=None, role=s.dev_role)
        return ANONYMOUS
    token = header.split(" ", 1)[1].strip()
    try:
        claims = await asyncio.to_thread(_decode, token)
        uuid.UUID(claims["sub"])
    except (jwt.PyJWTError, jwt.PyJWKClientError, ValueError, TypeError) as e:
        raise ApiError(401, "unauthorized", f"Invalid session token: {e}") from e
    user_id = claims.get("sub")
    role = await get_store().get_role(user_id) if user_id else None
    return User(id=user_id, role=role or "learner", email=claims.get("email"))


def require_role(minimum: str):
    async def dep(user: User = Depends(current_user)) -> User:
        if user.role == "anonymous":
            raise ApiError(401, "unauthorized", "Sign in to continue.")
        if ROLE_RANK.get(user.role, -1) < ROLE_RANK[minimum]:
            raise ApiError(403, "forbidden", f"This needs the {minimum} role.")
        return user

    return dep
