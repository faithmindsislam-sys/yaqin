"""Hybrid retrieval over approved sources: the current lesson's own sources first,
then vector search (Titan + pgvector) or BM25 when embeddings are unavailable."""

from __future__ import annotations

from app.domain.lessons import lesson_source_ids
from app.domain.search import Hit, Retrieved
from app.gateways.embedding_gateway import EmbeddingGateway
from app.repositories.repository import Repository

LESSON_BOOST = 0.15
BM25_FLOOR = 0.2  # relative to the best keyword hit


class RetrievalService:
    def __init__(self, repository: Repository, embeddings: EmbeddingGateway, *, k: int, vector_floor: float):
        self.repository = repository
        self.embeddings = embeddings
        self.k = k
        self.vector_floor = vector_floor

    async def retrieve(self, query: str, *, lesson: dict | None = None, k: int | None = None) -> Retrieved:
        k = k or self.k
        vector = await self.embeddings.embed(query)
        hits: list[Hit] = await self.repository.search(query, k=k, embedding=vector)
        floor = self.vector_floor if vector is not None else BM25_FLOOR

        scores: dict[str, float] = {h.source_id: h.score for h in hits if h.score >= floor}
        for sid in lesson_source_ids(lesson):
            # A question asked inside a lesson is about that lesson's material.
            scores[sid] = max(scores.get(sid, 0.0), floor) + LESSON_BOOST

        ranked = sorted(scores, key=lambda i: -scores[i])[: k + len(lesson_source_ids(lesson))]
        found = await self.repository.get_sources(ranked)
        ordered = {i: found[i] for i in ranked if i in found and found[i].get("review_status") == "approved"}
        return Retrieved(ordered, {i: round(scores[i], 4) for i in ordered})
