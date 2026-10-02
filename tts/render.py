"""Batch-render lesson narration with OmniVoice on a GPU host.

Narrates each card's title, explanation and takeaway in English and Arabic.
Never narrates Qur'an or hadith text: quote cards narrate only their title and
takeaway, and the app plays a human recitation for the verse itself.

    python render.py --content ./content --out ./out [--ref-en ref_en.wav --ref-en-text "..."]
                     [--ref-ar ref_ar.wav --ref-ar-text "..."] [--only wudu-order]

Output files follow each card's `audio` path, e.g. out/audio/wudu-order/c1.en.mp3.
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
from pathlib import Path

import soundfile as sf
import torch
from omnivoice import OmniVoice

SAMPLE_RATE = 24000
# Used only when no consented reference clip is given. Voice design is trained on
# English data, so Arabic falls back to the model's automatic voice.
DESIGN_EN = "male, middle-aged, moderate pitch"

QURAN_BRACKETS = re.compile(r"[﴾﴿].*?[﴾﴿]", re.S)

# Honorific glyphs the model cannot read: spell them out per language.
HONORIFICS = {
    "\ufdfa": {"en": "peace be upon him", "ar": "صلى الله عليه وسلم"},  # ﷺ
    "\ufdfb": {"en": "may God be pleased with him", "ar": "رضي الله عنه"},  # ﷻ-adjacent glyph
}

# Transliterations the English voice mispronounces (it read "wudu" as "voodoo").
# Respelling affects narration only; the on-screen text is untouched.
SAY_EN = {
    "wudu": "wudoo",
    "qibla": "qiblah",
    "tawhid": "tawheed",
    "kaaba": "kaabah",
    "qur'an": "quran",
    "hadath": "hadath",
    "madhhab": "madh-hab",
    "al-ikhlas": "al ikhlaas",
    "shafi'i": "shafi-ee",
    "'uthman": "uthman",
    "'affan": "affan",
    "sunnah": "sunnah",
    "tajweed": "tajweed",
    "ghunnah": "ghunnah",
    "idgham": "idghaam",
    "fatiha": "faatihah",
}
SAY_RE = re.compile(r"\b(" + "|".join(re.escape(k) for k in SAY_EN) + r")\b", re.I)


def _respell_en(text: str) -> str:
    def repl(m: re.Match[str]) -> str:
        word = m.group(0)
        said = SAY_EN[word.lower()]
        return said.capitalize() if word[:1].isupper() else said

    return SAY_RE.sub(repl, text)


def narration_text(card: dict, lang: str) -> str:
    def pick(field: str) -> str:
        v = card.get(field) or {}
        return (v.get(lang) or "").strip()

    parts = [pick("title")]
    if card.get("kind") != "quote":
        parts.append(pick("body"))
    parts.append(pick("takeaway"))
    text = " ".join(p.rstrip(".،") + "." for p in parts if p)
    # Belt and braces: never voice anything inside ornate Qur'an brackets.
    text = QURAN_BRACKETS.sub("", text)
    for glyph, say in HONORIFICS.items():
        text = text.replace(glyph, " " + say[lang] + " ")
    if lang == "en":
        text = _respell_en(text)
    return re.sub(r"\s+", " ", text).strip()


def to_mp3(wav: Path, mp3: Path) -> None:
    mp3.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-i", str(wav), "-ac", "1", "-ar", "24000", "-b:a", "64k", str(mp3)],
        check=True,
    )


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--content", type=Path, required=True)
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--ref-en", type=Path)
    ap.add_argument("--ref-en-text")
    ap.add_argument("--ref-ar", type=Path)
    ap.add_argument("--ref-ar-text")
    ap.add_argument("--only", nargs="*")
    ap.add_argument("--steps", type=int, default=32)
    args = ap.parse_args()

    model = OmniVoice.from_pretrained("k2-fsa/OmniVoice", device_map="cuda:0", dtype=torch.float16)

    def voice_kwargs(lang: str) -> dict:
        ref, ref_text = (args.ref_en, args.ref_en_text) if lang == "en" else (args.ref_ar, args.ref_ar_text)
        if ref:
            return {"ref_audio": str(ref), "ref_text": ref_text}
        return {"instruct": DESIGN_EN} if lang == "en" else {}

    tmp = args.out / "_wav"
    tmp.mkdir(parents=True, exist_ok=True)
    manifest = []
    for path in sorted(p for p in (args.content / "lessons").glob("*.json") if not p.name.startswith(".")):
        lesson = json.loads(path.read_text())
        if args.only and lesson["id"] not in args.only:
            continue
        for card in lesson["cards"]:
            for lang in ("en", "ar"):
                rel = (card.get("audio") or {}).get(lang)
                text = narration_text(card, lang)
                if not rel or not text:
                    continue
                audio = model.generate(text=text, num_step=args.steps, **voice_kwargs(lang))
                wav = tmp / f"{lesson['id']}-{card['id']}.{lang}.wav"
                sf.write(wav, audio[0], SAMPLE_RATE)
                to_mp3(wav, args.out / rel.lstrip("/"))
                manifest.append({"lesson": lesson["id"], "card": card["id"], "lang": lang, "file": rel, "chars": len(text)})
                print(f"{lesson['id']}/{card['id']}.{lang}  {len(text)} chars", flush=True)

    (args.out / "audio" / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=1))
    print(f"rendered {len(manifest)} clips")


if __name__ == "__main__":
    main()
