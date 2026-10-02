# Yaqin — shared contract

Single source of truth for the content model and the HTTP API. `web/`, `api/` and
`content/` all build against this file. Change it here first.

## Architecture

```
Browser ──► CloudFront ──┬─► S3            (Next.js static export, narration MP3s, images)
                         └─► /api/* ─► ALB ─► ECS Fargate (FastAPI)
                                               ├─► Supabase Postgres (+pgvector)
                                               └─► Amazon Bedrock (Claude, Titan embeddings)
Supabase Auth issues JWTs; the browser sends them as `Authorization: Bearer <jwt>`.
Guests use the app without an account; their progress lives in localStorage.
```

## Safety invariants (enforced in code, not only in prompts)

1. **Revealed text is never model-generated.** Qur'an and hadith text shown to the
   user always comes verbatim from the `sources` table. The model only refers to
   sources by id (`[[quran:2:256]]`); the server swaps the id for the stored text.
2. **Citations are validated.** Any source id in a model answer that was not in the
   retrieved set is dropped. An answer with zero valid citations for a religious
   claim is converted to an abstention.
3. **Tiering before answering** (scientific package levels):
   - `A` settled core information → direct answer, cited
   - `B` explanation/reasoning → answer from approved material, cited
   - `C` scholarly disagreement → state that scholars differ, no ruling
   - `D` personal fatwa / individual case → general info + referral, never a ruling
   - `OUT` outside scope (non-Islamic, harmful) → polite decline
4. **Abstain when evidence is weak.** If retrieval returns nothing above the
   similarity floor, the tutor says it could not find an approved source.
5. **Privacy.** No religious trait is inferred or stored. The chosen track is a UI
   preference, not a label. Tutor logs store tier + citation ids + latency only,
   never the question text unless the user opts in.
6. **Transparency.** Every AI answer is labelled as AI-generated.
7. **Recitation is never synthesized.** Narration audio skips ayah text; recitation
   uses licensed human recordings.

## Content model

### Source (`content/sources/*.json`, table `sources`)

```jsonc
{
  "id": "quran:5:6",              // quran:<surah>:<ayah> | hadith:<collection>:<number> | ref:<slug>
                                  // hadith numbers are the standard ones (Muslim: Fu'ad 'Abd al-Baqi)
  "kind": "quran",                // quran | hadith | tafsir | fiqh | aqidah | faq | dictionary
  "ref_en": "Al-Ma'idah 5:6",
  "ref_ar": "المائدة: 6",
  "text_ar": "…verbatim…",
  "text_en": "…approved translation…",
  "translation": "Saheeh International", // provenance of text_en
  "origin": "Tanzil Uthmani / quran.com API v4",
  "url": "https://quran.com/5/6",
  "grading": null,                // hadith only, e.g. "Sahih (al-Bukhari)"
  "review_status": "pending"      // pending | approved — set by a scholarly reviewer
}
```

### Lesson (`content/lessons/<id>.json`, table `lessons`)

```jsonc
{
  "id": "wudu-order",
  "track": "first-steps",         // explore | first-steps | deepen
  "module": "purification",
  "level": "foundation",          // foundation | deeper
  "minutes": 4,
  "title": { "en": "The order of wudu", "ar": "ترتيب أعضاء الوضوء" },
  "summary": { "en": "…", "ar": "…" },
  "cover": "/img/lessons/wudu.webp",
  "status": "published",          // draft | in_review | published
  "cards": [
    {
      "id": "c1",
      "kind": "concept",          // concept | quote | practice | check
      "title":    { "en": "…", "ar": "…" },
      "body":     { "en": "…", "ar": "…" },   // AI-drafted, reviewer-approved prose
      "takeaway": { "en": "…", "ar": "…" },
      "image": "/img/cards/wudu-1.webp",       // optional, reviewed illustration
      "visual": "steps",                       // optional built-in SVG visual key
      "sources": ["quran:5:6"],                // ids shown under "Sources"
      "label": "obligatory",                   // optional: obligatory | recommended | suggestion
      "audio": { "en": "/audio/wudu-order/c1.en.mp3", "ar": "/audio/wudu-order/c1.ar.mp3" }
    }
  ],
  "explain_back": {
    "prompt": { "en": "Explain the order of wudu in your own words", "ar": "…" },
    "key_ideas": [                             // checklist the learner's explanation is graded against
      { "id": "k1", "en": "Wash the face first", "ar": "…", "source": "quran:5:6" }
    ]
  },
  "quiz": [
    {
      "id": "q1",
      "question": { "en": "…", "ar": "…" },
      "options":  [{ "en": "…", "ar": "…" }],
      "answer": 0,
      "explanation": { "en": "…", "ar": "…" },
      "source": "quran:5:6"
    }
  ]
}
```

`card.kind = "quote"` renders `sources[0]` as the card body (verbatim text), so
quote cards never carry their own `body` text for scripture.

### Track (`content/tracks.json`)

```jsonc
[{ "id": "explore", "title": {"en": "Explore Islam", "ar": "اكتشف الإسلام"},
   "tagline": {...}, "audience": {...}, "modules": [{ "id": "...", "title": {...}, "lessons": ["lesson-id", ...] }] }]
```

## HTTP API (FastAPI, prefix `/api`)

All bodies are JSON. `lang` is `"en" | "ar"`. Auth header optional unless noted.

| Method | Path | Purpose |
|---|---|---|
| GET  | `/api/health` | `{ "ok": true, "model": "..." \| null, "db": true, "store": "postgres" \| "memory" }` |
| GET  | `/api/tracks` | Tracks with modules and lesson summaries |
| GET  | `/api/lessons/{id}` | Full lesson with `sources` resolved into a `sources_by_id` map |
| GET  | `/api/sources/{id}` | One source |
| POST | `/api/tutor/ask` | Ask & Check tutor (below) |
| POST | `/api/tutor/explain-back` | Grade a learner's explanation (below) |
| POST | `/api/review/check` | Pre-review of a lesson draft (instructor role): `{ready_for_reviewer, checks, issues: [{card, severity, issue, suggestion, origin: "rule"\|"ai"}]}` |
| GET  | `/api/review/queue` | Lessons in review (instructor role) |
| POST | `/api/review/{lesson_id}/decision` | `{decision: "approve"|"request_changes", note}` (reviewer role) |

### `POST /api/tutor/ask`

Request:
```json
{ "question": "Did Islam spread by the sword?", "lang": "en",
  "lesson_id": null, "track": "explore",
  "history": [{ "role": "user", "content": "..." }, { "role": "assistant", "content": "..." }] }
```

Response:
```jsonc
{
  "tier": "B",                    // A | B | C | D | OUT | NONE (no approved source found)
  "answer": [                     // ordered blocks; the UI renders them in sequence
    { "type": "text", "text": "Conquest and belief are two different things…" },
    { "type": "source", "id": "quran:2:256" },   // UI renders verbatim text from `sources`
    { "type": "text", "text": "…" }
  ],
  "sources": { "quran:2:256": { /* Source */ } },
  "referral": null,               // set for tier D: { "en": "...", "ar": "..." }
  "follow_ups": ["Why do Muslims pray five times a day?"],
  "ai_generated": true
}
```

### `POST /api/tutor/explain-back`

Request: `{ "lesson_id": "wudu-order", "transcript": "I wash my face…", "lang": "en" }`

Response:
```jsonc
{
  "covered": ["k1", "k2"],
  "missed": ["k3"],
  "misconceptions": [{ "text": "...", "correction": "...", "source": "quran:5:6" }],
  "feedback": "You started with the face and included the arms…",
  "sources": { "quran:5:6": { /* Source */ } },
  "ai_generated": true
}
```

### Errors

`{ "error": { "code": "rate_limited" | "bad_request" | "upstream" | "unauthorized", "message": "..." } }`
with the matching HTTP status. The tutor never returns a 500 to the UI for a
model failure; it returns `tier: "NONE"` with an apology block instead.

## Database (Supabase Postgres)

Tables: `profiles(id uuid pk → auth.users, display_name, role: learner|instructor|reviewer, preferred_track, lang)`,
`app_config(key, data jsonb)` (holds `tracks`),
`sources`, `source_chunks(id, source_id, lesson_id, lang, content, embedding vector(1024), tsv)`,
`lessons(id, track, module, status, data jsonb, author_id, updated_at)`,
`progress(user_id, lesson_id, card_index, completed_at, quiz_score, explain_back_score)`,
`review_events(id, lesson_id, actor_id, kind, payload jsonb, created_at)`,
`tutor_logs(id, created_at, tier, citation_ids text[], latency_ms, track)`.

RLS: learners read published lessons and approved/pending sources, and read/write
only their own `progress` and `profiles`. Instructors manage their own drafts.
Reviewers read all lessons and write review decisions. `tutor_logs` is insert-only
from the API service role.

## Environment

`api/.env`: `ENV`, `ALLOWED_ORIGINS`, `AWS_REGION`, `YAQIN_AWS_PROFILE` (local only; the shell's
`AWS_PROFILE` is deliberately ignored, and work-account profiles are refused),
`BEDROCK_MODEL_ID=anthropic.claude-opus-5-5`, `EMBED_MODEL_ID=amazon.titan-embed-text-v2:0`,
`DATABASE_URL`, `SUPABASE_URL`, optional `SUPABASE_JWT_SECRET` (legacy HS256 only), `DEV_ROLE` (local only).

Auth: Supabase signs user JWTs with ES256. The API verifies them against
`{SUPABASE_URL}/auth/v1/.well-known/jwks.json` (cached), audience `authenticated`,
issuer `{SUPABASE_URL}/auth/v1`. Secrets live outside the repo (`~/.config/yaqin/`).

`web/.env.local`: `NEXT_PUBLIC_API_BASE` (empty = same origin `/api`),
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
