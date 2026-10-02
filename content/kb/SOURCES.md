# Knowledge-base platforms

Survey of the platforms named in the challenge's updated scientific package
(`kb.pdf`, «المرجعية والحزمة العلمية والبيانات — محدث», pages 8–15), probed
2026-10-02. All requests were made with a curl-style User-Agent; none needed a key
unless noted.

| Platform | Status | Used for | Endpoint(s) | Auth | Reuse terms |
|---|---|---|---|---|---|
| **QuranEnc** موسوعة القرآن الكريم | ✅ works | Qur'an Arabic + English (`english_saheeh`, Noor International Center = Saheeh International, v1.1.2) | `/api/v1/translations/list/{lang}`, `/api/v1/translation/aya/{key}/{sura}/{aya}` → `{result:{arabic_text, translation, footnotes}}`; also `/sura/{key}/{n}`; SQLite/PDF downloads | none | Published on quranenc.com/en/home/api: republish allowed with **no modification, addition or deletion**, credit QuranEnc.com, state the version, keep translator info, update to latest version, no inappropriate ads. Other English keys: `english_rwwad`, `english_hilali_khan`. |
| **HadeethEnc** موسوعة الأحاديث النبوية | ✅ works | 152 hadith (ar+en) with grade, attribution, explanation, benefits, references | `/api/v1/languages`, `/api/v1/categories/list/?language=`, `/api/v1/hadeeths/list/?language=&category_id=&page=&per_page=`, `/api/v1/hadeeths/one/?language=&id=` | none | No terms text returned by the API or docs page (docs page renders client-side). Treated like QuranEnc: verbatim, credited, linked. |
| **TerminologyEnc** موسوعة المصطلحات الإسلامية | ✅ works (same API shape as HadeethEnc) | 38 glossary terms (ar+en) | `/api/v1/terms/list/?language=&category_id=&page=&per_page=`, `/api/v1/terms/one/?language=&id=` → `term, idio_def, brief_expl, brief_ling_def` | none | None published in the API. Verbatim, credited, linked. |
| **ICADB** القاعدة المركزية للمحتوى الإسلامي باللغات | ✅ works (Swagger at `/api/docs/`, "Public read-only API") | 37 approved Q&A cards (encyclopedias 110 لغير المسلمين and 102 للمسلمين) | `/api/encyclopedias/list/`, `/api/encyclopedias/{external_id}/cards/latest/?approved_only=true`, `/api/encyclopedias/cards/{id}/translations/{iso}/`; also Qur'an, books, lookup tables | none for reads (Basic auth defined for others) | Licence field "ICADB", no further text. **Q&A and terminology encyclopedias have no English yet** (translations endpoint 404 for all 202 non-Muslim Q&A cards); the hadith encyclopedia (101) has English. |
| **islamenc.com** موسوعة المحتوى الإسلامي باللغات | ⚠️ no documented public REST found | — | Site is client-rendered; `/api/*` paths tried return NestJS 404. Its cards come from ICADB, which we use directly. | — | — |
| **byenah.com** بيان الإسلام | ❌ 403 Forbidden on `/ar/api` and `/api` | — | — | — | — |
| **IslamHouse** دار الإسلام | ✅ works (public key from the Postman docs) | Not ingested | `api3.islamhouse.com/v3/<public-key>/main/{section}/{lang}/{lang}/{page}/{per}/json`; 494 English articles, 808 books | public key in URL | Items are mostly PDF/DOC attachments, not inline text — ingesting means PDF extraction (decision needed). |
| **mp3quran.net** | ✅ works | Recitation URL + ayah timings (Alafasy, Hafs, read 123) on every Qur'an source | `/api/v3/reciters?language=eng`, `/api/v3/ayat_timing/reads`, `/api/v3/ayat_timing?surah=&read=` | none | No terms text in API. Surah-level MP3s (`server8.mp3quran.net/afs/005.mp3`) with per-ayah `start_ms`/`end_ms`. |
| **dorar.net** الدرر السنية | ❌ Cloudflare challenge (403) for `article/389` and `dorar_api.json` from scripts | — | — | — | Would need a browser or an arrangement with dorar. |
| **mcp.islamiccontent.org** | ✅ works (Streamable HTTP at `/mcp`, no auth) | Not used (recorded only) | 11 read-only tools: `search`, `fetch`, `get_quran_verses`, `list_quran_translations`, `get_quran_audio` (per-verse MP3), `get_hadith`, `browse_hadith_categories`, `browse_library`, `get_library_item`, `list_library_categories`, `list_languages` | none | Site states: free, read-only, no tracking; "no fatwas — retrieves published text only". |

## What changed in the knowledge base

| Kind | Before | After |
|---|---|---|
| Qur'an (`quran`) | 29 ayat from quran.com (footnote markers stripped) | Same 29 ids re-sourced from QuranEnc, translation verbatim with markers + `footnotes_en`, version recorded, each with an Alafasy `recitation` |
| Hadith (`hadith`) | 9 (Bukhari/Muslim via hadith-api) | 9 + 152 HadeethEnc (`hadith:henc:*`), cross-linked via `see_also` where they are the same hadith |
| Q&A (`faq`) | 0 | 37 ICADB cards (Arabic) |
| Glossary (`dictionary`) | 0 | 38 TerminologyEnc terms (ar+en) |

Re-run: `python3 content/tools/fetch_quranenc.py && python3 content/tools/fetch_hadeethenc.py && python3 content/tools/fetch_terms.py && python3 content/tools/fetch_icadb_faq.py && python3 content/validate.py`.
