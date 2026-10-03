"""The whole Qur'an, word for word, for the Studio source picker (packed by content/tools/bundle_quran.py)."""
import json
from functools import lru_cache

from .config import get_settings

AR_DIGITS = str.maketrans("0123456789", "٠١٢٣٤٥٦٧٨٩")


@lru_cache
def _ayat() -> dict:
    path = get_settings().content_dir / "quran" / "ayat.json"
    return json.loads(path.read_text()) if path.exists() else {"surahs": []}


def ayah_source(surah: int, ayah: int) -> dict | None:
    """One verse as a source library entry, or None when the Qur'an has no such verse."""
    data = _ayat()
    if not 1 <= surah <= len(data["surahs"]):
        return None
    s = data["surahs"][surah - 1]
    if not 1 <= ayah <= len(s["ayat"]):
        return None
    ar, en = s["ayat"][ayah - 1]
    return {"id": f"quran:{surah}:{ayah}", "kind": "quran", "ref_en": f"{s['name_en']} {surah}:{ayah}",
            "ref_ar": f"{s['name_ar']}: {str(ayah).translate(AR_DIGITS)}", "text_ar": ar, "text_en": en,
            "translation": f"{data['en']['title']} ({data['en']['provider']})", "origin": data["en"]["provider"], "url": s["url"],
            "grading": None, "review_status": "pending", "arabic_edition": f"{data['ar']['title']} ({data['ar']['provider']})"}
