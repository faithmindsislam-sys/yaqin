# Yaqin content

Lessons, tracks and approved sources for the three learning tracks. The shape of
every file is defined in [`docs/CONTRACT.md`](../docs/CONTRACT.md).

```
content/
  tracks.json              tracks → modules → lesson ids
  lessons/<id>.json        one lesson: cards, explain-back checklist, quiz
  sources/quran.json       Qur'an verses (verbatim, fetched)
  sources/hadith.json      hadith (verbatim, fetched)
  eval/safety_cases.json   the 12 scientific-package safety test cases
  tools/fetch_sources.py   regenerates sources/ from the upstream APIs
  validate.py              shape + integrity checks (run before every commit)
```

## Provenance

**Nothing in `sources/` is typed by hand.** `tools/fetch_sources.py` downloads
each item and writes it unchanged, apart from removing translation footnote
markers. Re-running the script reproduces the files.

| Kind | Arabic text | English text | Upstream |
|---|---|---|---|
| Qur'an | `text_uthmani` (Uthmani script) | Saheeh International (quran.com resource 20; footnote markers removed) | `api.quran.com/api/v4/verses/by_key` |
| Hadith | Arabic edition | English edition of the same index | `fawazahmed0/hadith-api@1` via jsDelivr |

Hadith ids use the standard numbering shown on sunnah.com: al-Bukhari's
number, and Fu'ad 'Abd al-Baqi's number for Sahih Muslim (`hadith:muslim:223`;
a letter picks a sub-narration, `hadith:muslim:376c`). Fetch them with
`api/scripts/fetch_sources.py`, which maps these to the upstream edition. Only
the two Sahih collections (al-Bukhari and Muslim) are used, and each hadith was
read in full before it was cited, to confirm it says what the lesson claims.

The challenge's scientific package names King Fahd Complex texts and
quranpedia.net as the reference for Qur'an text and translation. Before public
launch, the reviewer should confirm the Uthmani text against the King Fahd
Mushaf, and decide whether to keep Saheeh International or switch to a King Fahd
Complex translation. Changing the translation only needs a different resource id
in `fetch_sources.py`.

### What is AI-drafted

All lesson prose (`title`, `body`, `takeaway`, quiz text, explain-back key ideas)
was drafted with AI assistance and is labelled as explanation, never as
scripture. Scripture reaches the learner only through `quote` cards and the
*Sources* panel, both rendered from `sources/`. `validate.py` enforces this: it
fails if card prose reproduces four or more consecutive words (Arabic) or six or
more (English) of a cited verse or hadith.

## Review process

1. **Draft.** A lesson is written or edited as JSON, with every claim tied to a
   source id. `python3 content/validate.py --fix` fills the audio paths and must
   report `OK`.
2. **AI pre-review.** In the instructor workspace, `POST /api/review/check`
   checks that every cited id exists and supports the card, and flags strong
   wording on matters of disagreement.
3. **Scholarly review.** A qualified reviewer works through the checklist below,
   approves each source (`review_status: "approved"`), and approves or returns the
   lesson. Decisions are logged in `review_events`.
4. **Publish.** Only `status: "published"` lessons are served to learners. Until a
   reviewer signs off, sources stay `pending` and the UI shows them as
   *awaiting scholarly review*.

All lessons are currently `published` so the demo is complete. **All 38
sources are `pending`.**

## Reviewer checklist

Tick each item, or correct the lesson. Items marked **[C]** are matters of
scholarly disagreement (tier C), where the lesson must present the difference
without picking a side.

### First Steps — `wudu-order`
- [ ] c1: "The Prophet ﷺ described purity as half of faith" fairly reflects Muslim 534 (book 2, hadith 1).
- [ ] c3: the four obligatory parts are per 5:6. "Scholars generally include the elbows/ankles" fairly states the majority view.
- [ ] c4 **[C]**: order is obligatory for the Shafi'i and Hanbali schools, and Sunnah for the Hanafi and Maliki schools. Confirm the attribution.
- [ ] c5 **[C]**: intention is required for the majority, and Sunnah for the Hanafis; it need not be voiced. Confirm, and confirm that citing Bukhari 1 as the general basis is appropriate.
- [ ] c6: the description matches the hadith of Humran ('Uthman's wudu): Muslim 538 (book 2, hadith 5) and Bukhari 164 (book 4, hadith 30). It says once is valid and three times is the fuller Sunnah.
- [ ] c6 **[C]**: the Hanbali school holds rinsing the mouth and nose to be obligatory. Confirm the attribution.
- [ ] Quiz q3 ("once is valid, three is the fuller Sunnah") is accurate.

### First Steps — `what-breaks-wudu`
- [ ] c1: "you do not have to repeat wudu before every prayer if nothing has broken it." Bukhari 135 is cited; a more explicit source could be added.
- [ ] c3: urine, stool and wind as agreed nullifiers; Bukhari 135 and 5:6.
- [ ] c4 **[C]**: sleep. Deep sleep breaks wudu for most scholars; light dozing while seated firmly does not for many. Muslim 835 (Companions slept and prayed without renewing wudu) is cited. Confirm the framing, and the mention of touching the private parts and bleeding as disputed.
- [ ] c5: "certainty is not removed by doubt" as drawn from Bukhari 137 (book 4, hadith 3).

### Explore Islam — `spread-by-sword`
- [ ] c4 (historical, no scripture source): conversion in Egypt, Syria and Iraq was gradual over generations and centuries; protected communities kept their places of worship and paid jizya in exchange for exemption from military service. Check that this is fair and not overstated.
- [ ] c5 (historical): Indonesia, Malaysia and much of East and West Africa embraced Islam mainly through traders and teachers, not armies.
- [ ] c7: "rulers or individuals who coerced anyone acted against that teaching." Check the framing.
- [ ] 60:8 and 16:125 are cited as supporting principles, not as proof of the historical claims.

### Explore Islam — `kaaba-qibla`
- [ ] c4: the reading of 2:115 ("east and west belong to God") avoids any interpretation of "the Face of Allah" beyond what the lesson states.
- [ ] c5: unity and the Abraham connection; 2:127 and 2:150.

### Explore Islam — `who-is-god`
- [ ] c1: "Allah is the Arabic word for God; Arabic-speaking Christians use it too" (factual, uncited).
- [ ] c4: the three aspects of Tawhid (lordship, worship, names and attributes). The challenge glossary says to keep the term with an explanation and not reduce it to numerical oneness.
- [ ] c7: "no intermediaries, no priest needed."

### Deepen — `al-fatiha-meaning`
- [ ] c1: the summary of the hadith qudsi (Muslim 878, book 4, hadith 41).
- [ ] c3: al-Rahman (mercy for all creation) and al-Rahim (special mercy for believers), as commonly explained by classical exegetes.
- [ ] c3 **[C]**: whether the Basmala is a verse of Al-Fatiha. The difference is stated without picking a side.
- [ ] c5: hamd versus shukr; the meanings of Rabb and al-'alamin.
- [ ] c10: placing "Iyyaka" first expresses exclusivity (hasr).
- [ ] c13: the two ways of straying explained generically ("knowing the truth and abandoning it; losing it through ignorance"), without naming groups.

### Deepen — `why-face-qibla`
- [ ] c1: about sixteen or seventeen months facing Jerusalem, and the first prayer toward the Kaaba being 'Asr (Bukhari 40, book 2, hadith 33).
- [ ] c3: 2:143 "God would never let your faith go to waste" understood as referring to the earlier prayers (a common tafsir explanation).
- [ ] c6 **[C]**: what to do if you prayed in the wrong direction after a sincere effort; the lesson defers the details to a teacher.

### Sources
- [ ] Spot-check `text_ar` of every Qur'an entry against the King Fahd Mushaf.
- [ ] Decide on the English translation to use (see Provenance).
- [ ] Set `review_status: "approved"` on each source once checked.
