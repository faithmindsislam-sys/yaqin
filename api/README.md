# Yaqin API

FastAPI backend for Yaqin. The contract it implements is in [`../docs/CONTRACT.md`](../docs/CONTRACT.md).

## Run locally (no infrastructure)

With `DATABASE_URL` unset the API serves `../content/` from memory and uses BM25
keyword search. With no AWS profile configured the tutor runs in offline mode:
it shows keyword-matched approved sources, clearly labelled, and explain-back uses
a keyword overlap check.

```bash
cd api
python3.12 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt
cp .env.example .env
.venv/bin/uvicorn app.main:app --reload --port 8000
curl localhost:8000/api/health
```

Interactive docs: http://localhost:8000/api/docs

## Turn on Claude and embeddings

Set `YAQIN_AWS_PROFILE` in `api/.env` to a profile for **your own** AWS account,
with Bedrock model access to `anthropic.claude-opus-5-5` and
`amazon.titan-embed-text-v2:0` in `AWS_REGION`. The app deliberately ignores the
shell's `AWS_PROFILE` and refuses profiles on a deny list. In ECS, leave it empty;
the task role is used.

## Database

Apply the migrations in the order documented in [Supabase setup](../docs/SUPABASE_SETUP.md), including `0002_source_extra.sql`, to the Supabase project, set
`DATABASE_URL` (the pooler connection string) and seed:

```bash
.venv/bin/python -m scripts.seed            # sources, lessons, tracks, chunks, embeddings
.venv/bin/python -m scripts.seed --no-embed # keyword index only
```

Re-running preserves persisted sources, lesson edits, curriculum updates and approvals; unchanged chunks keep their embeddings.

## Fetch verbatim sources

```bash
.venv/bin/python -m scripts.fetch_sources quran:5:6 quran:1:1-7 hadith:bukhari:1 hadith:muslim:223 --out ../content/sources
```

- Qur'an: quran.com API v4, Uthmani text, Saheeh International (`--translation <id>` to change).
- Hadith: fawazahmed0/hadith-api. Collections: bukhari, muslim, nawawi, abudawud, tirmidhi, nasai, ibnmajah.
  Muslim numbers are the standard Fu'ad 'Abd al-Baqi numbers (the ones sunnah.com shows).
- Every record lands as `review_status: "pending"` until a scholarly reviewer approves it.

## Tests and safety evaluation

```bash
.venv/bin/python -m pytest -q                                   # invariants, with the model mocked
.venv/bin/python -m scripts.eval_safety --base http://localhost:8000 --json eval.json
```

`eval_safety` runs the 12 test questions from the challenge's scientific package against a live
deployment (needs Bedrock) and prints automated checks plus the checks a human must confirm.

## Docker

Build from the repository root (the image bundles `content/`):

```bash
docker build -f api/Dockerfile -t yaqin-api .
docker run -p 8000:8000 --env-file api/.env yaqin-api
```

Login and database configuration: [Supabase setup](../docs/SUPABASE_SETUP.md).

Account fields and permissions: [account contract](../docs/CONTRACT.md#accounts-and-access).
Roles are `learner`, `teacher`, `admin`, `super_admin`; new signups are learners.
Apply `0004_account_roles.sql` when ready to update Supabase. Existing `instructor` and
`reviewer` profiles still work until then. CDN-only frontend mode does not need a hosted
FastAPI service; Supabase login remains independent. User/role/quota management and
admin MFA are documented as the next backend work, rather than exposed before hosting.
