"""Exact verses from the local Quran catalog bundled by content/tools/bundle_quran.py."""

import json
from pathlib import Path

from app.gateways.quran_gateway import QuranGateway

AR_DIGITS = str.maketrans("0123456789", "٠١٢٣٤٥٦٧٨٩")


class QuranCatalogGateway(QuranGateway):
    def __init__(self, content_dir: Path):
        self._path = content_dir / "quran" / "ayat.json"
        self._catalog: dict | None = None

    def ayah_source(self, surah: int, ayah: int) -> dict | None:
        if self._catalog is None:
            self._catalog = json.loads(self._path.read_text()) if self._path.exists() else {"surahs": []}
        data = self._catalog
        if not 1 <= surah <= len(data["surahs"]):
            return None
        entry = data["surahs"][surah - 1]
        if not 1 <= ayah <= len(entry["ayat"]):
            return None
        ar, en = entry["ayat"][ayah - 1]
        return {
            "id": f"quran:{surah}:{ayah}",
            "kind": "quran",
            "ref_en": f"{entry['name_en']} {surah}:{ayah}",
            "ref_ar": f"{entry['name_ar']}: {str(ayah).translate(AR_DIGITS)}",
            "text_ar": ar,
            "text_en": en,
            "translation": f"{data['en']['title']} ({data['en']['provider']})",
            "origin": data["en"]["provider"],
            "url": entry["url"],
            "grading": None,
            "review_status": "pending",
            "arabic_edition": f"{data['ar']['title']} ({data['ar']['provider']})",
        }
