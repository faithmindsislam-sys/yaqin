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
