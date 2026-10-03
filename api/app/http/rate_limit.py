"""Per-client token bucket for the model-backed endpoints (protects the Bedrock bill
on a public demo). In-process only; good enough for one or two Fargate tasks."""

from __future__ import annotations

import time

from fastapi import Request

from app.configuration.settings import get_settings
from app.domain.errors import ApiError

_buckets: dict[str, tuple[float, float]] = {}


def _client_key(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for")
    return fwd.split(",")[0].strip() if fwd else (request.client.host if request.client else "unknown")


async def limit(request: Request) -> None:
    rate = get_settings().tutor_rate_per_minute
    capacity, refill = float(rate), rate / 60.0
    key = _client_key(request)
    now = time.monotonic()
    tokens, last = _buckets.get(key, (capacity, now))
    tokens = min(capacity, tokens + (now - last) * refill)
    if tokens < 1:
        raise ApiError(429, "rate_limited", "Too many questions in a short time. Please wait a moment.")
    _buckets[key] = (tokens - 1, now)
    if len(_buckets) > 50_000:
        _buckets.clear()
