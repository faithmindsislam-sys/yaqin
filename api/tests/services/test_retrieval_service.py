from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.domain.search import Hit
from app.gateways.embedding_gateway import EmbeddingGateway
from app.services.retrieval_service import RetrievalService


class StubEmbeddings(EmbeddingGateway):
    def __init__(self, vector):
        self.vector = vector

    async def embed(self, text: str):
        return self.vector

    async def close(self):
        pass


@pytest.mark.parametrize("vector,expected", [(None, ["approved"]), ([0.1], [])])
async def test_injected_embeddings_select_threshold_and_pending_sources_are_excluded(vector, expected):
    repository = SimpleNamespace(
        search=AsyncMock(return_value=[Hit("approved", 0.25, "text"), Hit("pending", 0.9, "text")]),
        get_sources=AsyncMock(
            return_value={"approved": {"review_status": "approved"}, "pending": {"review_status": "pending"}}
        ),
    )
    service = RetrievalService(repository, StubEmbeddings(vector), k=8, vector_floor=0.32)
    result = await service.retrieve("question")
    assert result.ids == expected
    repository.search.assert_awaited_once_with("question", k=8, embedding=vector)
