"""Claude on Amazon Bedrock (Mantle Messages API), returning schema-valid JSON via a strict tool."""

from __future__ import annotations

import json
import logging
from typing import Any

import jsonschema

from .config import get_settings

log = logging.getLogger(__name__)


class LLMUnavailable(Exception):
    """No credentials, refusal, upstream error or unparsable output. Callers degrade to tier NONE."""


_client = None
RESPOND_TOOL = "respond"


def _get_client():
    global _client
    s = get_settings()
    if not s.aws_enabled:
        raise LLMUnavailable("AWS is not configured for this app")
    if _client is None:
        from anthropic import AsyncAnthropicBedrockMantle

        kwargs: dict[str, Any] = {"aws_region": s.bedrock_region, "timeout": 60.0, "max_retries": 2}
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
    client = _get_client()
    # Bedrock's Messages endpoint rejects output_config.format and strict tools, and Opus 5.5
    # rejects forced tool_choice: the schema rides on a tool, and we validate the result here.
    tool = {
        "name": RESPOND_TOOL,
        "description": "Return your complete response. Call this exactly once.",
        "input_schema": schema,
    }
    last_error = "no structured response from model"
    for _attempt in range(2):
        try:
            data = await _call(client, system, messages, tool, effort, max_tokens)
            jsonschema.validate(data, schema)
            return data
        except jsonschema.ValidationError as e:
            last_error = f"schema mismatch: {e.message}"
            log.warning("model output failed schema: %s", e.message)
    raise LLMUnavailable(last_error)


async def _call(client, system: str, messages: list[dict], tool: dict, effort: str, max_tokens: int) -> dict:
    import anthropic

    try:
        resp = await client.messages.create(
            model=get_settings().bedrock_model_id,
            max_tokens=max_tokens,
            system=f"{system}\n\nRespond only by calling the `{RESPOND_TOOL}` tool exactly once.",
            messages=messages,
            tools=[tool],
            tool_choice={"type": "auto", "disable_parallel_tool_use": True},
            output_config={"effort": effort},
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
    call = next((b for b in resp.content if b.type == "tool_use" and b.name == RESPOND_TOOL), None)
    if call is not None and isinstance(call.input, dict):
        return call.input
    # Fallback: a model that answered in text with the JSON object.
    text = next((b.text for b in resp.content if b.type == "text"), "")
    try:
        data = json.loads(text)
    except json.JSONDecodeError as e:
        raise LLMUnavailable("no structured response from model") from e
    if not isinstance(data, dict):
        raise LLMUnavailable("no structured response from model")
    return data
