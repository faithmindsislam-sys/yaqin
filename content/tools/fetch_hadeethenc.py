"""Ingest hadith from HadeethEnc (موسوعة الأحاديث النبوية) into sources/hadith.json.

    python3 content/tools/fetch_hadeethenc.py              # the curated categories below
    python3 content/tools/fetch_hadeethenc.py --ids 2962   # specific hadith

Each hadith is stored verbatim in Arabic and English with HadeethEnc's grade
and attribution. The explanation (شرح) and benefits (فوائد) are scholarly
commentary, kept in separate fields — never shown as revealed text.
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from kb_http import NotFound, get_json, load_sources, q, save_sources  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "sources" / "hadith.json"
API = "https://hadeethenc.com/api/v1"

# category id -> max hadith to take (HadeethEnc category tree, 2026-10).
CATEGORIES = {
    437: 42,  # Ablution (incl. method, pillars, nullifiers, excellence)
    439: 4,   # Dry ablution
    456: 11,  # Obligation of prayer
    457: 10,  # Virtue of prayer
    464: 8,   # Method of prayer
    73: 14,   # Oneness of Allah's worship
    271: 8,   # Excellence of monotheism
    94: 7,    # Branches of faith
    92: 5,    # Increase and decrease of faith
    80: 10,   # Pre-Islamic prophets (incl. 'Isa)
    81: 10,   # Our Prophet Muhammad
    654: 8,   # Prophet's mercy
    288: 2,   # Manners of divergence
    325: 10,  # Calling to Allah (da'wah)
    629: 3,   # Merit of knowledge
    277: 6,   # Merits of good deeds
}

# Our own Bukhari/Muslim ids, matched against HadeethEnc's reference field.
REF_PATTERNS = [(r"صحيح البخاري[^()]*\([^)]*\)\s*\((\d+)\)", "bukhari"), (r"صحيح مسلم[^()]*\([^)]*\)\s*\((\d+)\)", "muslim")]


def list_ids(cat: int, limit: int) -> list[str]:
    ids, page = [], 1
    while len(ids) < limit:
        d = get_json(f"{API}/hadeeths/list/?{q({'language': 'en', 'category_id': cat, 'page': page, 'per_page': 50})}")
        ids += [h["id"] for h in d.get("data", [])]
        meta = d.get("meta", {})
        if page >= int(meta.get("last_page", 1)):
            break
        page += 1
    return ids[:limit]


def one(hid: str, lang: str) -> dict:
    return get_json(f"{API}/hadeeths/one/?{q({'language': lang, 'id': hid})}")


def clean_list(v) -> list[str]:
    return [x.strip() for x in (v or []) if isinstance(x, str) and x.strip()]


def build(hid: str, cats: dict) -> dict | None:
    try:
        ar, en = one(hid, "ar"), one(hid, "en")
    except NotFound:
        return None
    if not ar.get("hadeeth") or not en.get("hadeeth"):
        return None
    src = {
        "id": f"hadith:henc:{hid}",
        "kind": "hadith",
        "ref_en": f"HadeethEnc {hid} · {en.get('attribution', '').strip()}",
        "ref_ar": f"موسوعة الأحاديث {hid} · {ar.get('attribution', '').strip()}",
        "title_en": en.get("title", "").strip(),
        "title_ar": ar.get("title", "").strip(),
        "text_ar": ar["hadeeth"].strip(),
        "text_en": en["hadeeth"].strip(),
        "translation": "HadeethEnc approved English translation",
        "origin": "HadeethEnc.com — موسوعة الأحاديث النبوية",
        "url": f"https://hadeethenc.com/en/browse/hadith/{hid}",
        "grading": f"{en.get('grade', '').strip()} · {ar.get('grade', '').strip()}".strip(" ·"),
        "attribution_en": en.get("attribution", "").strip(),
        "attribution_ar": ar.get("attribution", "").strip(),
        "explanation_en": (en.get("explanation") or "").strip() or None,
        "explanation_ar": (ar.get("explanation") or "").strip() or None,
        "benefits_en": clean_list(en.get("hints")),
        "benefits_ar": clean_list(ar.get("hints")),
        "reference_ar": (ar.get("reference") or "").strip() or None,
        "categories": sorted(set(ar.get("categories") or []) | set(cats.get(hid, []))),
        "review_status": "pending",
    }
    refs = []
    for pat, coll in REF_PATTERNS:
        for m in re.finditer(pat, src["reference_ar"] or ""):
            refs.append(f"hadith:{coll}:{m.group(1)}")
    if refs:
        # Standard collection numbers named in HadeethEnc's own reference list.
        src["collection_refs"] = sorted(set(refs))
    return src


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ids", nargs="*")
    args = ap.parse_args()

    cats: dict[str, list[str]] = {}
    wanted: list[str] = []
    if args.ids:
        wanted = args.ids
    else:
        for cat, limit in CATEGORIES.items():
            for hid in list_ids(cat, limit):
                cats.setdefault(hid, []).append(str(cat))
                if hid not in wanted:
                    wanted.append(hid)

    items = load_sources(OUT)
    by_id = {s["id"]: s for s in items}
    added = 0
    for hid in wanted:
        src = build(hid, cats)
        if src is None:
            print(f"  skip {hid}: no ar+en text")
            continue
        added += src["id"] not in by_id
        by_id[src["id"]] = src

    # Cross-link HadeethEnc entries with our own Bukhari/Muslim entries for the same hadith.
    for s in list(by_id.values()):
        s.pop("see_also", None) if s["id"].startswith("hadith:henc:") else None
    for s in list(by_id.values()):
        for other in s.get("collection_refs", []):
            if other in by_id:
                s["see_also"] = sorted(set(s.get("see_also", [])) | {other})
                own = by_id[other]
                own["see_also"] = sorted(set(own.get("see_also", [])) | {s["id"]})
    save_sources(OUT, list(by_id.values()))
    print(f"{len(wanted)} requested, {added} new, {sum(1 for k in by_id if k.startswith('hadith:henc:'))} HadeethEnc total")


if __name__ == "__main__":
    main()
