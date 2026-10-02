"""AI-assisted pre-review of lesson drafts. Deterministic checks run first and
always; the model adds clarity and overreach notes when it is available."""

from __future__ import annotations

import json
import logging
from typing import Any

from . import llm, prompts
from .db import Store
from .llm import LLMUnavailable, strict_schema
from .retrieval import lesson_source_ids
from .text import looks_like_scripture, normalize_ar

log = logging.getLogger(__name__)

LOCALIZED_FIELDS = ("title", "body", "takeaway")


async def check(store: Store, draft: dict[str, Any]) -> dict:
    cited = lesson_source_ids(draft)
    known = await store.get_sources(cited)
    issues: list[dict] = []

    for sid in cited:
        if sid not in known:
            issues.append(_issue(_card_for(draft, sid), "high", f"Cites '{sid}', which is not in the approved source library.",
                                 "Add the source through the source fetcher, or remove the citation."))
        elif known[sid].get("review_status") != "approved":
            issues.append(_issue(_card_for(draft, sid), "medium", f"Source '{sid}' has not been approved by a reviewer yet.",
                                 "Ask the scholarly reviewer to verify the text and translation."))

    stored_ar = [normalize_ar(s.get("text_ar", "")) for s in known.values()]
    for card in draft.get("cards", []):
        if card.get("kind") == "quote" and not card.get("sources"):
            issues.append(_issue(card.get("id"), "high", "Quote card has no source; its text would have no provenance.",
                                 "Attach the source id; quote cards render the stored text."))
        for field in LOCALIZED_FIELDS:
            for lang, text in (card.get(field) or {}).items():
                if not isinstance(text, str) or not looks_like_scripture(text):
                    continue
                norm = normalize_ar(text)
                if not any(norm and norm in s for s in stored_ar):
                    issues.append(_issue(card.get("id"), "high",
                                         f"{field}.{lang} contains vowelled Arabic that does not match any cited source "
                                         "(possible unsourced or misquoted scripture).",
                                         "Move scripture into a quote card that references a stored source."))
        if card.get("kind") in ("concept", "practice") and not card.get("sources") and card.get("label") == "obligatory":
            issues.append(_issue(card.get("id"), "high", "Marked obligatory without any supporting source.",
                                 "Cite the evidence for the obligation, or relabel it."))

    ai_ran = False
    try:
        out = await llm.structured(
            system=prompts.REVIEW,
            messages=[{"role": "user", "content":
                       f"DRAFT LESSON (JSON):\n{json.dumps(draft, ensure_ascii=False)[:60000]}\n\n"
                       f"CITED SOURCES:\n{json.dumps(known, ensure_ascii=False)[:40000]}"}],
            schema=strict_schema(prompts.REVIEW_SCHEMA_PROPS),
            effort="medium",
            max_tokens=6000,
        )
        issues += [{**i, "origin": "ai"} for i in out.get("issues", [])]
        ai_ran = True
    except LLMUnavailable as e:
        log.info("review model unavailable: %s", e)

    high = sum(1 for i in issues if i["severity"] == "high")
    return {
        "lesson_id": draft.get("id"),
        "ready_for_reviewer": high == 0,
        "checks": {
            "sources_found": f"{len(known)}/{len(cited)}",
            "sources_approved": sum(1 for s in known.values() if s.get("review_status") == "approved"),
            "ai_review": ai_ran,
        },
        "issues": issues,
        "ai_generated": ai_ran,
    }


def _issue(card: str | None, severity: str, issue: str, suggestion: str) -> dict:
    return {"card": card or "", "severity": severity, "issue": issue, "suggestion": suggestion, "origin": "rule"}


def _card_for(draft: dict, sid: str) -> str | None:
    for card in draft.get("cards", []):
        if sid in card.get("sources", []):
            return card.get("id")
    return None
