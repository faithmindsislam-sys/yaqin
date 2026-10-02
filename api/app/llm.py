"""Claude on Amazon Bedrock (Mantle Messages API) with JSON-schema structured output."""

from __future__ import annotations

import json
import logging
from typing import Any

from .config import get_settings

log = logging.getLogger(__name__)


class LLMUnavailable(Exception):
    """No credentials, refusal, upstream error or unparsable output. Callers degrade to tier NONE."""


_client = None


def _get_client():
    global _client
    s = get_settings()
    if not s.aws_enabled:
        raise LLMUnavailable("AWS is not configured for this app")
    if _client is None:
        from anthropic import AsyncAnthropicBedrockMantle

        kwargs: dict[str, Any] = {"aws_region": s.aws_region, "timeout": 60.0, "max_retries": 2}
        if s.aws_profile:
            kwargs["aws_profile"] = s.aws_profile
        _client = AsyncAnthropicBedrockMantle(**kwargs)
    return _client


def strict_schema(properties: dict, required: list[str] | None = None) -> dict:
    return {"type": "object", "properties": properties, "required": required or list(properties), "additionalProperties": False}


async def structured(
    *, system: str, messages: list[dict], schema: dict, effort: str = "medium", max_tokens: int = 4000
) -> dict:
    """One Claude call constrained to `schema`. Raises LLMUnavailable on any failure."""
    import anthropic

    client = _get_client()
    try:
        resp = await client.messages.create(
            model=get_settings().bedrock_model_id,
            max_tokens=max_tokens,
            system=system,
            messages=messages,
            output_config={"effort": effort, "format": {"type": "json_schema", "schema": schema}},
        )
    except anthropic.RateLimitError as e:
        raise LLMUnavailable("rate limited upstream") from e
    except anthropic.APIStatusError as e:
        log.error("bedrock status %s: %s", e.status_code, e.message)
        raise LLMUnavailable(f"upstream status {e.status_code}") from e
    except anthropic.APIConnectionError as e:
        raise LLMUnavailable("upstream connection failed") from e
    except Exception as e:  # credential resolution and similar client-side failures
        log.error("bedrock client error: %s", e)
        raise LLMUnavailable(str(e)) from e

    if resp.stop_reason == "refusal":
        raise LLMUnavailable("model declined")
    if resp.stop_reason == "max_tokens":
        raise LLMUnavailable("output truncated")
    text = next((b.text for b in resp.content if b.type == "text"), None)
    if not text:
        raise LLMUnavailable("empty response")
    try:
        return json.loads(text)
    except json.JSONDecodeError as e:
        raise LLMUnavailable("invalid JSON from model") from e
