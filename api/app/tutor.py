"""Ask & Check tutor and explain-back grading.

The safety invariants from docs/CONTRACT.md are enforced here, after the model
responds, so they hold even when the model ignores its instructions."""

from __future__ import annotations

import logging
import re
import time
from typing import Literal

from pydantic import BaseModel, Field

from . import llm, prompts
from .db import Store
from .llm import LLMUnavailable, strict_schema
from .retrieval import Retrieved, lesson_source_ids, retrieve
from .text import strip_scripture, tokens

log = logging.getLogger(__name__)

Lang = Literal["en", "ar"]
MARKER = re.compile(r"\[\[\s*([a-z]+:[^\]\s]+)\s*\]\]")
STRAY_BRACKETS = re.compile(r"\[\[[^\]]*\]\]?")
HISTORY_TURNS = 6
LANGUAGE = {"en": "English", "ar": "Modern Standard Arabic"}


class Turn(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(max_length=4000)


class AskRequest(BaseModel):
    question: str = Field(min_length=1, max_length=1500)
    lang: Lang = "en"
    lesson_id: str | None = None
    track: Literal["explore", "first-steps", "deepen"] | None = None
    history: list[Turn] = Field(default_factory=list, max_length=20)


class ExplainRequest(BaseModel):
    lesson_id: str
    transcript: str = Field(min_length=1, max_length=4000)
    lang: Lang = "en"


def _text(key: str, lang: str) -> dict:
    return {"type": "text", "text": prompts.TEXT[key][lang]}


def parse_answer(raw: str, allowed: set[str]) -> tuple[list[dict], list[str], bool]:
    """Split model text on [[id]] markers. Unknown ids are dropped, and any
    scripture the model wrote itself is removed. Returns (blocks, cited_ids, stripped)."""
    blocks: list[dict] = []
    cited: list[str] = []
    stripped_any = False
    pos = 0
    for m in MARKER.finditer(raw):
        _push_text(blocks, raw[pos:m.start()])
        sid = m.group(1)
        if sid in allowed and sid not in cited:
            blocks.append({"type": "source", "id": sid})
            cited.append(sid)
        elif sid not in allowed:
            log.info("dropped unknown citation %s", sid)
        pos = m.end()
    _push_text(blocks, raw[pos:])
    for b in blocks:
        if b["type"] == "text":
            cleaned, removed = strip_scripture(STRAY_BRACKETS.sub("", b["text"]))
            stripped_any |= removed
            b["text"] = cleaned
    blocks = [b for b in blocks if b["type"] != "text" or b["text"]]
    return blocks, cited, stripped_any


def _push_text(blocks: list[dict], text: str) -> None:
    text = re.sub(r"\n{3,}", "\n\n", text).strip()
    if text:
        blocks.append({"type": "text", "text": text})


def _history(req: AskRequest) -> list[dict]:
    turns = req.history[-HISTORY_TURNS:]
    msgs = [{"role": t.role, "content": t.content} for t in turns]
    while msgs and msgs[0]["role"] != "user":
        msgs.pop(0)
    # The API requires alternation; merge accidental repeats.
    merged: list[dict] = []
    for m in msgs:
        if merged and merged[-1]["role"] == m["role"]:
            merged[-1]["content"] += "\n\n" + m["content"]
        else:
            merged.append(dict(m))
    if merged and merged[-1]["role"] == "user":
        merged.pop()
    return merged


def sources_block(retrieved: Retrieved) -> str:
    lines = []
    for sid, s in retrieved.sources.items():
        lines.append(f"<source id=\"{sid}\" kind=\"{s.get('kind')}\" ref=\"{s.get('ref_en')}\""
                     + (f" grading=\"{s['grading']}\"" if s.get("grading") else "") + ">")
        if s.get("text_en"):
            lines.append(s["text_en"])
        if s.get("text_ar"):
            lines.append(s["text_ar"])
        lines.append("</source>")
    return "\n".join(lines) or "(no sources found)"


def _response(tier: str, blocks: list[dict], sources: dict, *, referral: dict | None = None,
              follow_ups: list[str] | None = None, ai: bool = True) -> dict:
    return {"tier": tier, "answer": blocks, "sources": sources, "referral": referral,
            "follow_ups": (follow_ups or [])[:3], "ai_generated": ai}


async def ask(store: Store, req: AskRequest) -> dict:
    started = time.monotonic()
    result = await _ask(store, req)
    cited = [b["id"] for b in result["answer"] if b["type"] == "source"]
    try:
        await store.log_tutor(result["tier"], cited, int((time.monotonic() - started) * 1000), req.track)
    except Exception as e:
        log.warning("tutor log failed: %s", e)
    return result


async def _ask(store: Store, req: AskRequest) -> dict:
    lang = req.lang
    lesson = await store.get_lesson(req.lesson_id) if req.lesson_id else None

    try:
        route = await llm.structured(
            system=prompts.CLASSIFY,
            messages=[{"role": "user", "content": f"Track: {req.track or 'unknown'}\nQuestion: {req.question}"}],
            schema=strict_schema(prompts.CLASSIFY_SCHEMA_PROPS),
            effort="low",
            max_tokens=1000,
        )
    except LLMUnavailable as e:
        log.warning("classifier unavailable: %s", e)
        return await _offline(store, req, lesson)

    tier = route.get("tier", "B")
    if tier == "OUT":
        return _response("OUT", [_text("decline", lang)], {})

    query = f"{req.question} {route.get('search_query', '')}".strip()
    retrieved = await retrieve(store, query, lesson=lesson)
    referral = prompts.TEXT["referral"] if tier == "D" else None

    if not retrieved:
        if tier == "D":
            return _response("D", [_text("personal_general", lang)], {}, referral=referral)
        return _response("NONE", [_text("abstain", lang)], {})

    user_msg = (
        f"SOURCES:\n{sources_block(retrieved)}\n\n"
        f"Learner track: {req.track or 'unknown'}"
        + (f"\nCurrent lesson: {lesson['title'].get('en')}" if lesson else "")
        + (f"\nThe question is phrased in a hostile way." if route.get("hostile") else "")
        + f"\n\nQUESTION:\n{req.question}"
    )
    try:
        out = await llm.structured(
            system=prompts.ANSWER.format(tier=tier, language=LANGUAGE[lang]),
            messages=[*_history(req), {"role": "user", "content": user_msg}],
            schema=strict_schema(prompts.ANSWER_SCHEMA_PROPS),
            effort="medium",
            max_tokens=6000,
        )
    except LLMUnavailable as e:
        log.warning("answer unavailable: %s", e)
        return _response("NONE", [_text("unavailable", lang)], {}, ai=False)

    blocks, cited, stripped = parse_answer(out.get("answer", ""), set(retrieved.ids))
    if stripped:
        log.info("removed model-written scripture from answer")
    follow_ups = [f for f in out.get("follow_ups", []) if isinstance(f, str) and f.strip()]

    if out.get("makes_religious_claim", True) and not cited:
        # Invariant 2: a religious claim with no valid citation is not shown.
        if tier == "D":
            return _response("D", [_text("personal_general", lang)], {}, referral=referral)
        return _response("NONE", [_text("abstain", lang)], {}, follow_ups=follow_ups)

    if tier == "D":
        blocks = [_text("personal_general", lang), *blocks]
    used = {sid: retrieved.sources[sid] for sid in cited}
    return _response(tier, blocks, used, referral=referral, follow_ups=follow_ups)


async def _offline(store: Store, req: AskRequest, lesson: dict | None) -> dict:
    """No model available: show keyword-matched approved sources, clearly labelled."""
    retrieved = await retrieve(store, req.question, lesson=None)
    top = [sid for sid in retrieved.ids if retrieved.scores[sid] >= 0.5][:2]
    if not top:
        return _response("NONE", [_text("unavailable", req.lang)], {}, ai=False)
    blocks = [_text("unavailable", req.lang), _text("keyword_matches", req.lang)]
    blocks += [{"type": "source", "id": sid} for sid in top]
    return _response("NONE", blocks, {sid: retrieved.sources[sid] for sid in top}, ai=False)


async def explain_back(store: Store, req: ExplainRequest) -> dict | None:
    lesson = await store.get_lesson(req.lesson_id)
    if lesson is None:
        return None
    ideas = lesson.get("explain_back", {}).get("key_ideas", [])
    idea_ids = [i["id"] for i in ideas]
    lesson_ids = lesson_source_ids(lesson)
    sources = await store.get_sources(lesson_ids)
    lang = req.lang

    checklist = "\n".join(f"- {i['id']}: {i.get('en')} / {i.get('ar')}" + (f" (source {i['source']})" if i.get("source") else "")
                          for i in ideas)
    srcs = "\n".join(f"<source id=\"{sid}\" ref=\"{s.get('ref_en')}\">{s.get('text_en', '')}</source>" for sid, s in sources.items())
    prompt_text = lesson.get("explain_back", {}).get("prompt", {}).get("en", "")
    try:
        out = await llm.structured(
            system=prompts.EXPLAIN_BACK.format(language=LANGUAGE[lang]),
            messages=[{"role": "user", "content": (
                f"LESSON: {lesson['title'].get('en')}\nTASK GIVEN TO LEARNER: {prompt_text}\n\n"
                f"KEY IDEAS (in lesson order):\n{checklist}\n\nSOURCES:\n{srcs or '(none)'}\n\n"
                f"LEARNER'S EXPLANATION:\n{req.transcript}")}],
            schema=strict_schema(prompts.EXPLAIN_SCHEMA_PROPS),
            effort="low",
            max_tokens=3000,
        )
        ai = True
    except LLMUnavailable as e:
        log.warning("explain-back model unavailable, using keyword overlap: %s", e)
        out, ai = _overlap_grade(ideas, req.transcript, lang), False

    covered = [i for i in idea_ids if i in set(out.get("covered", []))]
    missed = [i for i in idea_ids if i not in covered]
    misconceptions = []
    for m in out.get("misconceptions", []):
        sid = m.get("source") or None
        misconceptions.append({
            "text": strip_scripture(m.get("text", ""))[0],
            "correction": strip_scripture(m.get("correction", ""))[0],
            "source": sid if sid in sources else None,
        })
    cited = {m["source"] for m in misconceptions if m["source"]} | {i["source"] for i in ideas if i["id"] in missed and i.get("source")}
    return {
        "covered": covered,
        "missed": missed,
        "misconceptions": misconceptions,
        "feedback": strip_scripture(out.get("feedback", ""))[0],
        "sources": {sid: sources[sid] for sid in cited if sid in sources},
        "ai_generated": ai,
    }


def _overlap_grade(ideas: list[dict], transcript: str, lang: str) -> dict:
    said = set(tokens(transcript))
    covered = []
    for i in ideas:
        want = set(tokens(f"{i.get('en', '')} {i.get('ar', '')}"))
        if want and len(want & said) / min(len(want), 4) >= 0.5:
            covered.append(i["id"])
    msg = {
        "en": f"You covered {len(covered)} of {len(ideas)} key ideas. (Automatic keyword check; the AI tutor is offline.)",
        "ar": f"ذكرتَ {len(covered)} من {len(ideas)} أفكار رئيسية. (فحص آلي بالكلمات؛ المعلّم الذكي غير متاح الآن.)",
    }[lang]
    return {"covered": covered, "misconceptions": [], "feedback": msg}
