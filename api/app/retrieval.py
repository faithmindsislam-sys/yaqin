"""Hybrid retrieval over approved sources: the current lesson's own sources first,
then vector search (Titan + pgvector) or BM25 when embeddings are unavailable."""

from __future__ import annotations

from dataclasses import dataclass

from . import embeddings
from .config import get_settings
from .db import Hit, Store

LESSON_BOOST = 0.15
BM25_FLOOR = 0.2  # relative to the best keyword hit


@dataclass
class Retrieved:
    sources: dict[str, dict]  # id -> Source, in rank order
    scores: dict[str, float]

    @property
    def ids(self) -> list[str]:
        return list(self.sources)

    def __bool__(self) -> bool:
        return bool(self.sources)


def lesson_source_ids(lesson: dict | None) -> list[str]:
    if not lesson:
        return []
    ids: list[str] = []
    for card in lesson.get("cards", []):
        ids += card.get("sources", [])
    for idea in lesson.get("explain_back", {}).get("key_ideas", []):
        if idea.get("source"):
            ids.append(idea["source"])
    for q in lesson.get("quiz", []):
        if q.get("source"):
            ids.append(q["source"])
    return list(dict.fromkeys(ids))


async def retrieve(store: Store, query: str, *, lesson: dict | None = None, k: int | None = None) -> Retrieved:
    s = get_settings()
    k = k or s.retrieval_k
    vector = await embeddings.embed(query)
    hits: list[Hit] = await store.search(query, k=k, embedding=vector)
    floor = s.vector_floor if vector is not None else BM25_FLOOR

    scores: dict[str, float] = {h.source_id: h.score for h in hits if h.score >= floor}
    for sid in lesson_source_ids(lesson):
        # A question asked inside a lesson is about that lesson's material.
        scores[sid] = max(scores.get(sid, 0.0), floor) + LESSON_BOOST

    ranked = sorted(scores, key=lambda i: -scores[i])[: k + len(lesson_source_ids(lesson))]
    found = await store.get_sources(ranked)
    ordered = {i: found[i] for i in ranked if i in found}
    return Retrieved(ordered, {i: round(scores[i], 4) for i in ordered})
