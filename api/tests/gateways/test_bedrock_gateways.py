import io
import json
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest

from app.configuration.settings import Settings
from app.domain.structured_output import strict_schema
from app.gateways.bedrock.embedding_gateway import BedrockEmbeddingGateway
from app.gateways.bedrock.llm_gateway import BedrockLLMGateway
from app.gateways.llm_gateway import LLMUnavailable

SCHEMA = strict_schema({"answer": {"type": "string"}})


def tool_response(output):
    return SimpleNamespace(
        stop_reason="tool_use", content=[SimpleNamespace(type="tool_use", name="respond", input=output)]
    )


def model_gateway(*responses):
    gateway = BedrockLLMGateway(Settings(_env_file=None, yaqin_aws_profile="test-personal"))
    gateway._client = SimpleNamespace(
        messages=SimpleNamespace(create=AsyncMock(side_effect=responses)), close=AsyncMock()
    )
    return gateway


async def test_structured_response_validates_and_retries_once():
    gateway = model_gateway(tool_response({"answer": 42}), tool_response({"answer": "valid"}))
    result = await gateway.structured(system="test", messages=[], schema=SCHEMA, effort="low", max_tokens=10)
    assert result == {"answer": "valid"}
    assert gateway._client.messages.create.await_count == 2
    kwargs = gateway._client.messages.create.call_args.kwargs
    assert kwargs["model"] == gateway.settings.bedrock_model_id
    assert kwargs["tools"][0]["input_schema"] == SCHEMA
    assert kwargs["output_config"] == {"effort": "low"}
    assert kwargs["max_tokens"] == 10


async def test_invalid_model_output_has_a_bounded_retry():
    gateway = model_gateway(tool_response({"answer": 42}), tool_response({"answer": 42}))
    with pytest.raises(LLMUnavailable, match="schema mismatch"):
        await gateway.structured(system="test", messages=[], schema=SCHEMA)
    assert gateway._client.messages.create.await_count == 2


@pytest.mark.parametrize("reason", ["refusal", "max_tokens"])
async def test_incomplete_model_responses_are_unavailable(reason):
    gateway = model_gateway(SimpleNamespace(stop_reason=reason, content=[]))
    with pytest.raises(LLMUnavailable):
        await gateway.structured(system="test", messages=[], schema=SCHEMA)


async def test_text_json_response_is_still_schema_validated():
    gateway = model_gateway(
        SimpleNamespace(stop_reason="end_turn", content=[SimpleNamespace(type="text", text='{"answer":"valid"}')])
    )
    assert await gateway.structured(system="test", messages=[], schema=SCHEMA) == {"answer": "valid"}


async def test_model_client_is_closed_once_and_released():
    gateway = model_gateway()
    client = gateway._client
    await gateway.close()
    await gateway.close()
    client.close.assert_awaited_once()
    assert gateway._client is None


async def test_offline_gateways_do_not_create_provider_clients():
    settings = Settings(_env_file=None)
    llm = BedrockLLMGateway(settings)
    embeddings = BedrockEmbeddingGateway(settings)
    with pytest.raises(LLMUnavailable, match="AWS is not configured"):
        await llm.structured(system="test", messages=[], schema=SCHEMA)
    assert await embeddings.embed("test") is None
    assert llm._client is None and embeddings._client is None


async def test_embeddings_use_titan_parameters_and_release_client():
    gateway = BedrockEmbeddingGateway(Settings(_env_file=None, yaqin_aws_profile="test-personal"))
    client = Mock()
    client.invoke_model.return_value = {"body": io.BytesIO(b'{"embedding":[0.1,0.2]}')}
    gateway._client = client
    assert await gateway.embed("x" * 9000) == [0.1, 0.2]
    kwargs = client.invoke_model.call_args.kwargs
    assert kwargs["modelId"] == gateway.settings.embed_model_id
    assert json.loads(kwargs["body"]) == {"inputText": "x" * 8000, "dimensions": 1024, "normalize": True}
    await gateway.close()
    await gateway.close()
    client.close.assert_called_once()
    assert gateway._client is None


async def test_embedding_failure_uses_keyword_fallback():
    gateway = BedrockEmbeddingGateway(Settings(_env_file=None, yaqin_aws_profile="test-personal"))
    gateway._client = Mock()
    gateway._client.invoke_model.side_effect = RuntimeError("provider unavailable")
    assert await gateway.embed("test") is None
