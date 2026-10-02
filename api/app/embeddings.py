"""Titan Text Embeddings v2 on Bedrock (1024 dims, normalized). Returns None when
AWS is not configured; callers fall back to keyword search."""

from __future__ import annotations

import asyncio
import json
import logging
from functools import lru_cache

from .config import get_settings

log = logging.getLogger(__name__)
DIMENSIONS = 1024


@lru_cache
def _client():
    import boto3

    s = get_settings()
    session = boto3.Session(profile_name=s.aws_profile, region_name=s.aws_region) if s.aws_profile else boto3.Session(region_name=s.aws_region)
    return session.client("bedrock-runtime")


def embed_sync(text: str) -> list[float]:
    s = get_settings()
    body = json.dumps({"inputText": text[:8000], "dimensions": DIMENSIONS, "normalize": True})
    resp = _client().invoke_model(modelId=s.embed_model_id, body=body, accept="application/json", contentType="application/json")
    return json.loads(resp["body"].read())["embedding"]


async def embed(text: str) -> list[float] | None:
    if not get_settings().aws_enabled:
        return None
    try:
        return await asyncio.to_thread(embed_sync, text)
    except Exception as e:  # network, throttling, missing model access
        log.warning("embedding failed, falling back to keyword search: %s", e)
        return None
