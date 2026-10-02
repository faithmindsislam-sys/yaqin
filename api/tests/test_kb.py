from app.db import passage_text, source_extra, source_passages
from scripts.seed import source_chunks, split

HADITH = {
    "id": "hadith:henc:3313",
    "kind": "hadith",
    "ref_en": "HadeethEnc 3313 · Agreed upon",
    "ref_ar": "موسوعة الأحاديث 3313 · متفق عليه",
    "title_en": "If anyone performs ablution like this ablution of mine",
    "text_en": "Humran reported that 'Uthman called for water for ablution...",
    "text_ar": "عن حمران مولى عثمان...",
    "explanation_en": "The Prophet taught the manner of ablution.",
    "explanation_ar": "علّم النبي صفة الوضوء.",
    "benefits_en": ["Teaching by demonstration."],
    "benefits_ar": [],
    "grading": "Authentic · صحيح",
    "review_status": "pending",
}

FAQ = {
    "id": "ref:icadb:36130",
    "kind": "faq",
    "ref_en": "Q&A for non-Muslims · card 1",
    "ref_ar": "موسوعة الأسئلة · بطاقة 1",
    "question_ar": "ما هي الكعبة؟ وهل يعبد المسلمون الكعبة؟",
    "text_ar": "الكعبة قبلة المسلمين...",
    "text_en": "",
    "languages": ["ar"],
    "review_status": "pending",
}


def test_explanation_chunks_are_labelled_and_resolve_to_the_hadith():
    passages = source_passages(HADITH)
    suffixes = [s for s, _lang, _t in passages]
    assert suffixes == ["en", "expl-en", "ar", "expl-ar"]
    expl = dict((s, t) for s, _l, t in passages)["expl-en"]
    assert "Scholarly explanation (not hadith text)" in expl
    assert "Teaching by demonstration." in expl
    assert {c["source_id"] for c in source_chunks(HADITH)} == {"hadith:henc:3313"}


def test_arabic_only_faq_has_question_and_no_english_chunk():
    chunks = source_chunks(FAQ)
    assert [c["lang"] for c in chunks] == ["ar"]
    assert "هل يعبد المسلمون الكعبة" in chunks[0]["content"]
    assert "الكعبة" in passage_text(FAQ)


def test_long_text_is_split_with_reference_on_every_piece():
    text = "REF\n" + "\n".join("para %d " % i + "x" * 400 for i in range(10))
    pieces = split(text, limit=1000)
    assert len(pieces) > 1
    assert all(p.startswith("REF\n") and len(p) <= 1000 for p in pieces)


def test_extra_holds_only_kind_specific_fields():
    extra = source_extra(HADITH)
    assert "explanation_en" in extra and "text_en" not in extra and "id" not in extra


async def test_persisted_source_metadata_reaches_index_and_content_bundle(monkeypatch):
    from contextlib import nullcontext
    from types import SimpleNamespace
    from unittest.mock import AsyncMock
    from app.db import CORE_SOURCE_FIELDS, PgStore
    from scripts import seed

    persisted = {**HADITH, "text_en": "Approved reviewer wording", "review_status": "approved"}
    row = {key: persisted.get(key) for key in CORE_SOURCE_FIELDS} | {"extra": source_extra(persisted)}
    conn = SimpleNamespace(
        set_type_codec=AsyncMock(), fetchval=AsyncMock(return_value=True),
        transaction=lambda: nullcontext(), executemany=AsyncMock(), execute=AsyncMock(),
        fetch=AsyncMock(side_effect=[[row], [], []]), close=AsyncMock(),
    )
    monkeypatch.setattr("asyncpg.connect", AsyncMock(return_value=conn))
    monkeypatch.setattr(seed, "get_settings", lambda: SimpleNamespace(database_url="test", content_dir=None, aws_enabled=False))
    monkeypatch.setattr(seed, "load_content", lambda _: ([], {}, {HADITH["id"]: HADITH}))
    assert await seed.main(["--no-embed"]) == 0
    passages = "\n".join(chunk[4] for chunk in conn.executemany.call_args_list[-1].args[1])
    assert "Approved reviewer wording" in passages
    assert "Scholarly explanation (not hadith text)" in passages
    assert "Teaching by demonstration." in passages

    conn.fetchval.return_value = []
    conn.fetch.side_effect = [[], [{"id": HADITH["id"]}], [row]]
    store = PgStore(SimpleNamespace(acquire=lambda: nullcontext(conn)))
    bundle = await store.content_bundle()
    source = bundle["sources"][HADITH["id"]]
    assert {key: source[key] for key in persisted} == persisted
