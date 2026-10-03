import json

from app.gateways.quran_catalog_gateway import QuranCatalogGateway


def test_catalogs_are_owned_by_the_gateway_and_return_exact_pending_verses(tmp_path):
    gateways = []
    for name, text in (("first", "Exact first text"), ("second", "Exact second text")):
        directory = tmp_path / name / "quran"
        directory.mkdir(parents=True)
        catalog = {
            "surahs": [
                {"name_en": "Opening", "name_ar": "الفاتحة", "url": "https://example.test", "ayat": [["نص", text]]}
            ],
            "en": {"title": "English", "provider": "Test"},
            "ar": {"title": "Arabic", "provider": "Test"},
        }
        (directory / "ayat.json").write_text(json.dumps(catalog))
        gateways.append(QuranCatalogGateway(directory.parent))
    assert gateways[0].ayah_source(1, 1)["text_en"] == "Exact first text"
    assert gateways[1].ayah_source(1, 1)["text_en"] == "Exact second text"
    assert gateways[0].ayah_source(1, 1)["review_status"] == "pending"
    assert gateways[0].ayah_source(0, 1) is None
    assert gateways[0].ayah_source(1, 2) is None
