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

## Accounts and access

Supabase Auth owns `id`, email, password/provider credentials and email verification.
`profiles` owns `display_name`, `role`, `created_at` and the existing learning preferences
(`preferred_track`, `lang`, `daily_minutes`, `onboarded`, `known_lessons`). Do not duplicate
passwords or authentication tokens in profiles. Every signup is a `learner`; signup
metadata cannot grant a staff role.

| Role | Allowed work |
|---|---|
| `learner` | Published content and their own profile/progress |
| `teacher` | Learner access, create/edit their own unpublished lessons, submit for review |
| `admin` | Teacher access, all lesson drafts, source approval and publication |
| `super_admin` | Admin access; search users and change other users' roles in Studio |

For protected requests, the API verifies Supabase JWTs and reads the role from `profiles`.
Staff sign up as normal learners, then a super admin promotes them at `/studio/users/`.
No invitation emails are sent. Staff roles are assigned through trusted server/SQL access; browser clients
cannot change roles or write content directly. Only the author can submit a draft;
admins approve sources and publish after validation. Unknown roles cannot access staff
endpoints. Legacy `instructor`/`reviewer` profiles resolve to `teacher`/`admin` until
migration `0004_account_roles.sql` is applied. `/studio/` is the shared staff entrance;
`/instructor/` remains accessible for existing links. Subdomain routing is a hosting step.

Before hosting the API, set `NEXT_PUBLIC_API_ENABLED=false` at frontend build time.
The site reads its published `/data/content.json` snapshot from the static host/CDN
without calling FastAPI. Supabase login and profile/progress sync still work independently
when configured. Studio mutations and AI requests are unavailable in this mode.
After hosting, set it to `true` and configure `NEXT_PUBLIC_API_BASE` (or same-origin `/api`).
If the live content service fails, the saved snapshot remains available.
Refreshes retain the latest successful live lessons. Invalid snapshots are rejected;
sign-in, auth callbacks and password recovery render even if content is unavailable.

Apply `0004_account_roles.sql` before `0005_admin_users.sql`; the latter checks the
role constraint and staff policy prerequisite. The API database connection must be
able to read `auth.users` for email search. `admin_events` records each role change
in the same transaction as the profile update, with no browser access.

After those migrations, bootstrap the first super admin through trusted SQL using
the UUID of an existing, normally registered account:

```sql
update public.profiles set role = 'super_admin'
where id = 'YOUR_AUTH_USER_UUID';
```

Further promotions go through Studio. Self-role changes are refused. Quota tools,
admin MFA enrollment/enforcement, and the `app`/`studio` subdomain routes and exact
auth redirects remain deferred.

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

The provider registry is `content/kb/source_registry.json` (outside the source
record directory because that directory contains arrays of citable records).
HadeethEnc is primary and canonical for hadith text, its published English
translations and associated explanations. HadeethEnc source records and the
corpus manifest carry `provider: "hadeethenc"`, `canonical_for: "hadith"`,
`source_of_truth: true`, `priority: "primary"`. These optional fields persist in
the existing `sources.extra` JSONB column without a database migration.

Dorar, other collection editions and hadith quotations inside books are secondary
attributed references. They cannot silently replace canonical wording. Preserve
collection numbering and provider-attributed grades; never infer or upgrade a
grade. Quran resources and their provenance are independent of this hadith policy.
Canonical designation does not grant scholarly approval (`review_status` stays
pending until review). The complete corpus lives in `resources/hadeethenc/`; the
app's `hadith.json` remains its curated projection, linked by provider ID.

```jsonc
{
  "id": "quran:5:6",              // quran:<surah>:<ayah> | hadith:(bukhari|muslim):<number> | hadith:henc:<id>
                                  // | ref:icadb:<card> (faq) | ref:terminologyenc:<term> (dictionary)
                                  // Bukhari/Muslim numbers are the standard ones (Muslim: Fu'ad 'Abd al-Baqi)
  "kind": "quran",                // quran | hadith | tafsir | fiqh | aqidah | faq | dictionary
  "ref_en": "Al-Ma'idah 5:6",
  "ref_ar": "المائدة: ٦",          // Arabic-Indic digits
  "text_ar": "…verbatim…",
  "text_en": "…approved translation…", // "" when languages == ["ar"]
  "translation": "English Translation - Noor International Center (QuranEnc english_saheeh v1.1.2)",
  "origin": "QuranEnc.com — موسوعة القرآن الكريم",
  "url": "https://quranenc.com/en/browse/english_saheeh/5#6",
  "grading": null,                // hadith only, verbatim from the platform, e.g. "Authentic · صحيح"
  "review_status": "pending",     // pending | approved — set by a scholarly reviewer

  // Optional, by kind (stored in the `extra` jsonb column):
  "languages": ["ar"],            // only when a source exists in Arabic only
  "footnotes_en": "[104] …",      // quran: translator's footnotes, verbatim
  "recitation": {                 // quran: human recitation, never synthesized
    "reciter_en": "Mishary Alafasy", "reciter_ar": "مشاري العفاسي", "rewaya": "Hafs 'an 'Asim",
    "url": "https://server8.mp3quran.net/afs/005.mp3", "start_ms": 1234, "end_ms": 56789, "origin": "mp3quran.net"
  },
  "title_en": "…", "title_ar": "…",                    // hadith:henc
  "attribution_en": "Agreed upon", "attribution_ar": "متفق عليه",
  "explanation_en": "…", "explanation_ar": "…",        // scholarly commentary — never shown as hadith text
  "benefits_en": ["…"], "benefits_ar": ["…"],
  "reference_ar": "صحيح البخاري (…) (164)…",
  "collection_refs": ["hadith:bukhari:164"],          // standard numbers named by the platform
  "see_also": ["hadith:bukhari:164"],                 // other sources in this KB that are the same hadith
  "question_ar": "…", "question_en": null,             // faq
  "source_note_ar": "…", "version": "1.0",
  "term_en": "Monotheism", "term_ar": "توحيد",          // dictionary
  "linguistic_en": "…", "linguistic_ar": "…"
}
```

Retrieval chunks (`source_chunks`) are built by `app.db.source_passages`: one per
language with the reference (and the question/term/title) prepended, plus a
separate, labelled chunk for a hadith's explanation and benefits. Every chunk
resolves to its source id, so a commentary hit cites the hadith it explains.

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
| POST | `/api/review/check` | Pre-review of a lesson draft (teacher or higher): `{ready_for_reviewer, checks, issues: [{card, severity, issue, suggestion, origin: "rule"\|"ai"}]}` |
| GET  | `/api/review/queue` | Own lessons in review for teachers; all for admins |
| POST | `/api/review/{lesson_id}/decision` | `{decision: "approve"|"request_changes", note}` (admin or super admin) |
| GET | `/api/admin/users?q=` | Super admin only; case-insensitive email/display-name substring search, newest first, max 50; returns `[{id, email, display_name, role, created_at}]`. Empty `q` lists the newest users. |
| POST | `/api/admin/users/{id}/role` | Super admin only; `{role: "learner"|"teacher"|"admin"|"super_admin"}` → `{id, role}`. Self-change: 403; invalid role/id: 400; missing profile: 404. Requires a real session; updates role and audit atomically. |

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

Migration `0002_source_extra.sql` adds `sources.extra jsonb` for the kind-specific source fields above;
the API reads it when present and `scripts/seed.py` refuses to run until it is applied.

Tables: `profiles(id uuid pk → auth.users, display_name, role: learner|teacher|admin|super_admin, preferred_track, lang, created_at, daily_minutes, onboarded, known_lessons)`,
`app_config(key, data jsonb)` (holds `tracks`),
`sources`, `source_chunks(id, source_id, lesson_id, lang, content, embedding vector(1024), tsv)`,
`lessons(id, track, module, status, data jsonb, author_id, updated_at)`,
`progress(user_id, lesson_id, card_index, completed_at, quiz_score, explain_back_score)`,
`review_events(id, lesson_id, actor_id, kind, payload jsonb, created_at)`,
`admin_events(id uuid pk, actor_id uuid → auth.users, target_id uuid → auth.users, kind, payload jsonb, created_at)`
(kind `role_changed`, payload `{from_role, to_role}`; deleting an auth user nulls its audit reference),
`tutor_logs(id, created_at, tier, citation_ids text[], latency_ms, track)`.

RLS: learners read published lessons and approved/pending sources, and read/write
only their own `progress` and `profiles`. Teachers manage their own drafts through the API.
Admins and super admins read all lessons and write review decisions through the API. `tutor_logs` is insert-only
from the API service role.
`admin_events` has RLS enabled and no client policies or client grants; only trusted
server/SQL access can read or write it.

## Environment

`api/.env`: `ENV`, `ALLOWED_ORIGINS`, `AWS_REGION`, `YAQIN_AWS_PROFILE` (local only; the shell's
`AWS_PROFILE` is deliberately ignored, and work-account profiles are refused),
`BEDROCK_MODEL_ID=anthropic.claude-opus-5-5`, `EMBED_MODEL_ID=amazon.titan-embed-text-v2:0`,
`DATABASE_URL`, `SUPABASE_URL`, optional `SUPABASE_JWT_SECRET` (legacy HS256 only), `DEV_ROLE` (local only).

Auth: Supabase signs user JWTs with ES256. The API verifies them against
`{SUPABASE_URL}/auth/v1/.well-known/jwks.json` (cached), audience `authenticated`,
issuer `{SUPABASE_URL}/auth/v1`. Secrets live outside the repo (`~/.config/yaqin/`).

`web/.env.local`: `NEXT_PUBLIC_API_ENABLED` (`false` = CDN-only; defaults to enabled), `NEXT_PUBLIC_API_BASE` (empty = same origin `/api`),
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (or legacy `NEXT_PUBLIC_SUPABASE_ANON_KEY`).

## Completed workflows

See `SUPABASE_SETUP.md`; apply the missing migrations in the documented order.

- `GET /api/content`: live `{tracks, lessons, sources}`; published lessons only, no-store.
- `GET /api/review/lessons`: own lessons for teachers, all for admins and super admins.
- `POST /api/review/drafts`: validated lesson JSON; saves an unpublished draft with ownership checks.
- `POST /api/review/{id}/submit`: author submits a saved draft after checks.
- `GET /api/review/sources`: pending sources for staff.
- `POST /api/review/sources/{id}/approve`: admin or super-admin approval with an audit record.
- Publishing requires an in-review lesson and every cited source approved.
- Progress uses the `save_learning_progress` Supabase RPC with RLS and an atomic merge.
  Notes/card completion are in `progress`; streak dates are in `learning_days`.
  Daily minutes, onboarding and known lesson preferences are in `profiles`.
- Browser content writes are revoked; staff changes go through the validated API.
- Tutor retrieval and explain-back exclude unapproved sources in online and offline modes.
