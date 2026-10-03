# Yaqin · يقين

**Knowledge that brings you closer.** An AI learning companion that turns Islamic knowledge into
short visual lessons you can listen to and talk to, in Arabic and English, with every claim
traceable to an approved source.

Built for the *AI Challenge in Service of Islamic Content* — Track 03, Interactive Experiences and
the Learning Journey.

## Three tracks

| Track | For | First module |
|---|---|---|
| **Explore Islam** · اكتشف الإسلام | Anyone curious about Islam, or holding an objection | Common questions: who Muslims worship, the Kaaba, “spread by the sword?” |
| **First Steps** · خطواتي الأولى | Someone who has just become Muslim | Purification: the order of wudu, what breaks wudu |
| **Deepen My Knowledge** · أعمّق معرفتي | A Muslim who wants to go deeper | Understand what you recite: Al-Fatiha, why we face the qibla |

Learners choose their own track and can switch any time. The system never infers or stores
anything about a learner's beliefs.

## What a lesson does

1. **Visual cards** — one idea per card, an illustration, a takeaway; read or listen.
2. **Sources beside the explanation** — Qur'an and hadith shown verbatim from stored sources,
   labelled apart from AI-assisted explanation.
3. **Explain it back** — the learner explains the idea by voice or text; the tutor names the key
   idea that was missed and shows its source.
4. **Quick check** — a short quiz, each answer tied to a source.
5. **Ask & Check tutor** — questions answered only from approved material.

## Scholarly safety, enforced in code

- **Revealed text is never generated.** The model refers to sources by id (`[[quran:2:256]]`); the
  server substitutes the stored text. Scripture-like text written by the model is stripped.
- **Citations are validated.** Ids not in the retrieved set are dropped; a religious claim with no
  valid citation becomes an abstention.
- **Answer tiers** from the challenge's scientific package: (A) settled → cited answer,
  (B) explanation → answer with reference, (C) disagreement → states that scholars differ,
  (D) personal case → general information and referral, never a ruling.
- **Human review.** Every source ships as `pending` until a scholar approves it;
  `content/README.md` lists every claim that needs sign-off.
- **Privacy.** Tutor logs store tier, cited ids and latency only — never the question text.

See [`docs/CONTRACT.md`](docs/CONTRACT.md) for the full contract.

## Architecture

```
Browser ─► CloudFront ─┬─► S3              Next.js static export
                       └─► /api/* ─► ALB ─► ECS Fargate · FastAPI
                                             ├─► Supabase Postgres + pgvector (auth, progress, content)
                                             └─► Amazon Bedrock (Claude, Titan embeddings)
```

| Path | What |
|---|---|
| `web/` | Next.js 16 app (static export), bilingual with full RTL |
| `api/` | FastAPI: tutor, explain-back, content review, safety tests |
| `content/` | Lessons, tracks and sources (fetched verbatim), validator, safety eval cases |
| `supabase/migrations/` | Schema and row-level security |
| `docs/` | Contract between the three |

## Run locally

```bash
# API (runs offline with an in-memory store over content/ when no DB or AWS is configured)
cd api
python3 -m venv .venv
.venv/bin/python -m pip install -e ".[dev]"
touch .env
chmod 600 .env
.venv/bin/python run.py --reload

# Web
cd web && npm install
echo "NEXT_PUBLIC_API_BASE=http://127.0.0.1:8000" > .env.local
npm run dev -- --port 3100
```

Backend structure and PyCharm setup: [`api/README.md`](api/README.md).

Tests: `cd api && .venv/bin/python -m pytest -q` · content check: `python3 content/validate.py`.

## Sources and licences

- Qur'an text: Uthmani script via the quran.com API v4. English: Saheeh International.
- Hadith: Sahih al-Bukhari and Sahih Muslim (standard numbering), via the open hadith-api dataset;
  links point to sunnah.com.
- Reference framework: the challenge's scientific package (dorar.net, King Fahd Complex,
  dawa.center, islamic-content.com).
- Fonts: Readex Pro, DM Serif Display, Amiri Quran (SIL Open Font Licence).
- Code: MIT (see `LICENSE`).
