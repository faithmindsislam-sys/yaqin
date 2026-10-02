"""Validate Yaqin content against docs/CONTRACT.md. Stdlib only.

    python3 content/validate.py            # check, exit 1 on any error
    python3 content/validate.py --fix      # also (re)write card audio paths

Checks: lesson shape, track/module membership, every referenced source exists,
every bilingual field has non-empty en+ar, quote cards carry no body, and no
card prose reproduces 4+ consecutive words of a cited Qur'an/hadith text
(scripture must reach the learner verbatim from `sources`, never retyped).
"""
import json
import re
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent
LANGS = ("en", "ar")
TRACKS = {"explore", "first-steps", "deepen"}
CARD_KINDS = {"concept", "quote", "practice", "check"}
LABELS = {"obligatory", "recommended", "suggestion"}
VISUALS = {"steps", "order", "compass", "book", "none"}
LEVELS = {"foundation", "deeper"}
STATUSES = {"draft", "in_review", "published"}
SOURCE_KINDS = {"quran", "hadith", "tafsir", "fiqh", "aqidah", "faq", "dictionary"}
NGRAM = {"ar": 4, "en": 6}
# Formulaic phrases that are not scripture: honorifics and narration formulas.
FORMULAS_AR = ["صلي الله عليه وسلم", "رضي الله عنه", "رضي الله عنها", "رضي الله عنهم", "عليه السلام",
               "قال رسول الله", "رسول الله", "النبي", "بن عفان"]
FORMULAS_EN = [r"\(ﷺ\)", "ﷺ"]

errors = []


def err(where, msg):
    errors.append(f"{where}: {msg}")


def bilingual(where, value, required=True):
    if value is None:
        if required:
            err(where, "missing bilingual field")
        return
    if not isinstance(value, dict):
        err(where, "bilingual field must be an object {en, ar}")
        return
    for lang in LANGS:
        v = value.get(lang)
        if not isinstance(v, str) or not v.strip():
            err(where, f"missing or empty '{lang}'")
    if isinstance(value.get("ar"), str) and not re.search(r"[؀-ۿ]", value["ar"]):
        err(where, "'ar' contains no Arabic script")


def normalize(text, lang):
    if lang == "ar":
        text = "".join(c for c in unicodedata.normalize("NFKD", text) if not unicodedata.combining(c))
        text = re.sub("[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640]", "", text)
        text = re.sub("[\u0622\u0623\u0625\u0671]", "\u0627", text).replace("ى", "ي").replace("ة", "ه")
        for f in FORMULAS_AR:
            text = text.replace(f, " ")
        words = re.findall(r"[ء-ي]+", text)
    else:
        for f in FORMULAS_EN:
            text = re.sub(f, " ", text)
        text = re.sub(r"\[[^\]]*\]", " ", text)
        words = re.findall(r"[a-z']+", text.lower())
    return words


def ngrams(words, n):
    return {tuple(words[i:i + n]) for i in range(len(words) - n + 1)}


def load_sources():
    sources = {}
    for f in sorted((ROOT / "sources").glob("*.json")):
        for s in json.loads(f.read_text(encoding="utf-8")):
            where = f"sources/{f.name}:{s.get('id')}"
            if s.get("id") in sources:
                err(where, "duplicate source id")
            for key in ("id", "kind", "ref_en", "ref_ar", "text_ar", "text_en", "origin", "review_status"):
                if not s.get(key):
                    err(where, f"missing '{key}'")
            if s.get("kind") not in SOURCE_KINDS:
                err(where, f"bad kind {s.get('kind')!r}")
            if s.get("review_status") not in ("pending", "approved"):
                err(where, "review_status must be pending|approved")
            sources[s["id"]] = s
    return sources


def check_ref(where, sid, sources, allow_null=False):
    if sid is None:
        if not allow_null:
            err(where, "source is required")
        return
    if sid not in sources:
        err(where, f"unknown source id {sid!r}")


def check_overlap(where, text, lang, cited, sources):
    n = NGRAM[lang]
    words = normalize(text, lang)
    if len(words) < n:
        return
    mine = ngrams(words, n)
    for sid in cited:
        s = sources.get(sid)
        if not s or s["kind"] not in ("quran", "hadith"):
            continue
        hit = mine & ngrams(normalize(s[f"text_{lang}"], lang), n)
        if hit:
            err(where, f"reproduces scripture from {sid} ({lang}): '{' '.join(sorted(hit)[0])}…' — paraphrase, or move it to a quote card")


def check_lesson(path, sources, fix):
    data = json.loads(path.read_text(encoding="utf-8"))
    lid = data.get("id")
    where = f"lessons/{path.name}"
    if lid != path.stem:
        err(where, f"id {lid!r} must match file name")
    if data.get("track") not in TRACKS:
        err(where, f"bad track {data.get('track')!r}")
    if data.get("level") not in LEVELS:
        err(where, f"bad level {data.get('level')!r}")
    if data.get("status") not in STATUSES:
        err(where, f"bad status {data.get('status')!r}")
    if not isinstance(data.get("minutes"), int) or data["minutes"] <= 0:
        err(where, "minutes must be a positive integer")
    if not data.get("module"):
        err(where, "missing module")
    if not str(data.get("cover", "")).startswith("/img/"):
        err(where, "cover must be an /img/ path")
    bilingual(f"{where}.title", data.get("title"))
    bilingual(f"{where}.summary", data.get("summary"))

    cards = data.get("cards") or []
    if not cards:
        err(where, "no cards")
    seen = set()
    for card in cards:
        cw = f"{where}.cards[{card.get('id')}]"
        if card.get("id") in seen:
            err(cw, "duplicate card id")
        seen.add(card.get("id"))
        kind = card.get("kind")
        if kind not in CARD_KINDS:
            err(cw, f"bad kind {kind!r}")
        bilingual(f"{cw}.title", card.get("title"))
        bilingual(f"{cw}.takeaway", card.get("takeaway"))
        cited = card.get("sources") or []
        if not cited:
            err(cw, "card cites no sources")
        for sid in cited:
            check_ref(cw, sid, sources)
        if kind == "quote":
            if "body" in card:
                err(cw, "quote cards must not have a body: the verbatim source is the body")
            if cited and sources.get(cited[0], {}).get("kind") not in ("quran", "hadith"):
                err(cw, "a quote card's first source must be Qur'an or hadith")
        else:
            bilingual(f"{cw}.body", card.get("body"))
        if card.get("label") is not None and card["label"] not in LABELS:
            err(cw, f"bad label {card['label']!r}")
        if card.get("visual") is not None and card["visual"] not in VISUALS:
            err(cw, f"bad visual {card['visual']!r}")
        for field in ("body", "takeaway"):
            for lang in LANGS:
                text = (card.get(field) or {}).get(lang)
                if text:
                    check_overlap(f"{cw}.{field}.{lang}", text, lang, cited, sources)
        expected_audio = {lang: f"/audio/{lid}/{card.get('id')}.{lang}.mp3" for lang in LANGS}
        if fix:
            card["audio"] = expected_audio
        elif card.get("audio") != expected_audio:
            err(cw, "audio paths missing or not in the contract pattern (run with --fix)")

    eb = data.get("explain_back") or {}
    bilingual(f"{where}.explain_back.prompt", eb.get("prompt"))
    ideas = eb.get("key_ideas") or []
    if len(ideas) < 2:
        err(where, "explain_back needs at least 2 key ideas")
    for k in ideas:
        kw = f"{where}.explain_back[{k.get('id')}]"
        bilingual(kw, {"en": k.get("en"), "ar": k.get("ar")})
        check_ref(kw, k.get("source"), sources, allow_null=True)

    quiz = data.get("quiz") or []
    if not quiz:
        err(where, "no quiz")
    for q in quiz:
        qw = f"{where}.quiz[{q.get('id')}]"
        bilingual(f"{qw}.question", q.get("question"))
        bilingual(f"{qw}.explanation", q.get("explanation"))
        opts = q.get("options") or []
        if len(opts) < 2:
            err(qw, "needs at least 2 options")
        for i, o in enumerate(opts):
            bilingual(f"{qw}.options[{i}]", o)
        if not isinstance(q.get("answer"), int) or not 0 <= q["answer"] < len(opts):
            err(qw, "answer index out of range")
        check_ref(qw, q.get("source"), sources, allow_null=True)

    if fix:
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return data


def check_tracks(lessons):
    tracks = json.loads((ROOT / "tracks.json").read_text(encoding="utf-8"))
    listed = {}
    for t in tracks:
        tw = f"tracks.json[{t.get('id')}]"
        if t.get("id") not in TRACKS:
            err(tw, "unknown track id")
        for f in ("title", "tagline", "audience"):
            bilingual(f"{tw}.{f}", t.get(f))
        for m in t.get("modules") or []:
            bilingual(f"{tw}.{m.get('id')}.title", m.get("title"))
            for lid in m.get("lessons") or []:
                if lid not in lessons:
                    err(tw, f"module {m.get('id')} lists unknown lesson {lid!r}")
                    continue
                listed[lid] = (t["id"], m["id"])
                if (lessons[lid]["track"], lessons[lid]["module"]) != (t["id"], m["id"]):
                    err(tw, f"lesson {lid} declares {lessons[lid]['track']}/{lessons[lid]['module']}")
    for lid in lessons:
        if lid not in listed:
            err("tracks.json", f"lesson {lid} is not listed in any module")


def check_eval(sources):
    path = ROOT / "eval" / "safety_cases.json"
    if not path.exists():
        err("eval/safety_cases.json", "missing")
        return
    for c in json.loads(path.read_text(encoding="utf-8")):
        cw = f"eval[{c.get('id')}]"
        bilingual(f"{cw}.question", c.get("question"))
        if c.get("expected_tier") not in ("A", "B", "C", "D", "OUT", "NONE"):
            err(cw, f"bad expected_tier {c.get('expected_tier')!r}")
        if not c.get("expected_behaviour"):
            err(cw, "missing expected_behaviour")


def main():
    fix = "--fix" in sys.argv
    sources = load_sources()
    lessons = {}
    for path in sorted((ROOT / "lessons").glob("*.json")):
        data = check_lesson(path, sources, fix)
        lessons[data["id"]] = data
    check_tracks(lessons)
    check_eval(sources)
    cards = sum(len(l["cards"]) for l in lessons.values())
    if errors:
        print("\n".join(errors))
        print(f"\nFAIL: {len(errors)} problem(s) across {len(lessons)} lessons")
        sys.exit(1)
    print(f"OK: {len(lessons)} lessons, {cards} cards, {len(sources)} sources")


if __name__ == "__main__":
    main()
