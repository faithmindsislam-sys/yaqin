"""Language helpers: Arabic normalization, tokenizing, scripture detection, BM25."""

from __future__ import annotations

import math
import re
from collections import Counter

HARAKAT = re.compile("[ؐ-ًؚ-ٰٟۖ-ۭ࣓-ࣿ]")
ARABIC_LETTER = re.compile("[ء-يٱ-ۓ]")
TATWEEL = "ـ"
_ALEF = re.compile("[آأإٱ]")
_TOKEN = re.compile(r"[\w؀-ۿ]+", re.UNICODE)

STOP = {
    "the", "a", "an", "of", "to", "in", "and", "or", "is", "are", "was", "be", "for", "on", "with", "that",
    "this", "it", "as", "by", "at", "from", "do", "does", "did", "what", "why", "how", "who", "can", "i", "you",
    "my", "we", "me", "about", "if", "so", "not", "no", "your", "they", "their", "there", "which", "when",
    "في", "من", "على", "إلى", "الى", "عن", "ما", "ماذا", "لماذا", "هل", "و", "أو", "او", "هذا", "هذه", "ان", "أن",
    "إن", "كان", "التي", "الذي", "مع", "كيف", "لا", "لم", "ثم",
}


def normalize_ar(text: str) -> str:
    text = HARAKAT.sub("", text).replace(TATWEEL, "")
    text = _ALEF.sub("ا", text)
    return text.replace("ى", "ي").replace("ة", "ه")


def tokens(text: str) -> list[str]:
    out = []
    for t in _TOKEN.findall(normalize_ar(text.lower())):
        if t in STOP or len(t) < 2:
            continue
        if ARABIC_LETTER.match(t) and t.startswith("ال") and len(t) > 4:
            t = t[2:]
        out.append(t)
    return out


def looks_like_scripture(segment: str) -> bool:
    """Densely vowelled Arabic is how Qur'an and hadith text is typeset; ordinary
    Arabic prose is mostly unvowelled. Used to catch model-written quotations."""
    letters = len(ARABIC_LETTER.findall(segment))
    if letters < 12:
        return False
    return len(HARAKAT.findall(segment)) / letters > 0.35


_SCRIPTURE_SPAN = re.compile("﴿[^﴾]*﴾|[؀-ۿ][؀-ۿ\\s،؛]{12,}[؀-ۿ]")


def strip_scripture(text: str) -> tuple[str, bool]:
    """Remove ornate-bracket quotations and densely vowelled Arabic spans."""
    removed = False

    def repl(m: re.Match) -> str:
        nonlocal removed
        span = m.group(0)
        if span.startswith("\ufd3f") or looks_like_scripture(span):
            removed = True
            return ""
        return span

    cleaned = _SCRIPTURE_SPAN.sub(repl, text)
    cleaned = re.sub(r"[ \t]{2,}", " ", cleaned)
    cleaned = re.sub(r"[\"“”«»]\s*[\"“”«»]", "", cleaned)
    return cleaned.strip(), removed


class BM25:
    def __init__(self, docs: dict[str, str], k1: float = 1.4, b: float = 0.75):
        self.k1, self.b = k1, b
        self.docs = {d: tokens(t) for d, t in docs.items()}
        self.len = {d: len(t) for d, t in self.docs.items()}
        self.avg = (sum(self.len.values()) / len(self.len)) if self.len else 1.0
        df: Counter = Counter()
        for toks in self.docs.values():
            df.update(set(toks))
        n = max(len(self.docs), 1)
        self.idf = {t: math.log(1 + (n - f + 0.5) / (f + 0.5)) for t, f in df.items()}
        self.tf = {d: Counter(t) for d, t in self.docs.items()}

    def search(self, query: str, k: int = 8) -> list[tuple[str, float, int]]:
        """Returns (doc_id, score, matched_terms)."""
        q = set(tokens(query))
        scored = []
        for d, tf in self.tf.items():
            s, hits = 0.0, 0
            for t in q:
                if t not in tf:
                    continue
                hits += 1
                f = tf[t]
                s += self.idf[t] * f * (self.k1 + 1) / (f + self.k1 * (1 - self.b + self.b * self.len[d] / self.avg))
            if hits:
                scored.append((d, s, hits))
        scored.sort(key=lambda x: -x[1])
        return scored[:k]
