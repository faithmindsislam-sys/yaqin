"""Canonical source fields and citable retrieval passages."""

CORE_SOURCE_FIELDS = (
    "id",
    "kind",
    "ref_en",
    "ref_ar",
    "text_ar",
    "text_en",
    "translation",
    "origin",
    "url",
    "grading",
    "review_status",
)


def source_extra(source: dict) -> dict:
    """Kind-specific fields stored in `sources.extra` (jsonb)."""
    return {k: v for k, v in source.items() if k not in CORE_SOURCE_FIELDS}


def source_passages(source: dict) -> list[tuple[str, str, str]]:
    """Retrievable passages for one source as (chunk suffix, lang, text).

    Hadith explanations and benefits are scholarly commentary: their chunks are
    labelled as such and resolve to the hadith id, so the tutor cites the hadith
    while never presenting the commentary as the hadith itself."""
    ref = f"{source.get('ref_en', '')} | {source.get('ref_ar', '')}"
    out: list[tuple[str, str, str]] = []
    for lang in ("en", "ar"):
        head = ref
        if source.get("kind") == "faq" and source.get(f"question_{lang}"):
            head = f"{ref}\n{source[f'question_{lang}']}"
        if source.get("kind") == "dictionary" and source.get(f"term_{lang}"):
            head = f"{ref}\n{source[f'term_{lang}']}"
        if source.get("kind") == "hadith" and source.get(f"title_{lang}"):
            head = f"{ref}\n{source[f'title_{lang}']}"
        text = source.get(f"text_{lang}")
        if text:
            out.append((lang, lang, f"{head}\n{text}"))
        expl = source.get(f"explanation_{lang}")
        benefits = source.get(f"benefits_{lang}") or []
        if expl or benefits:
            label = "Scholarly explanation (not hadith text)" if lang == "en" else "شرح أهل العلم (ليس من نص الحديث)"
            body = "\n".join([expl or "", *benefits]).strip()
            out.append((f"expl-{lang}", lang, f"{ref}\n[{label}]\n{body}"))
    return out


def passage_text(source: dict) -> str:
    return "\n".join(text for _suffix, _lang, text in source_passages(source))
