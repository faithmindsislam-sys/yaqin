# Supabase setup for Yaqin

## Values needed

- Supabase Project URL and **publishable key** (or legacy anon key).
- Postgres connection string from **Connect → Transaction pooler**, including the database password. Store it privately in `api/.env` or deployment secrets.
- Exact frontend origin: local port and production domain.
- For Google login: Google OAuth web client ID and secret, entered into the Supabase Google provider settings.
- For confirmation/reset emails to real users: SMTP host, port, username/password and verified sender, entered into Supabase SMTP settings.

Never put database passwords, Supabase secret/service-role keys, Google secrets or SMTP passwords in `NEXT_PUBLIC_*` variables.

## Database

On a new project apply `supabase/migrations/0001_init.sql`, `0002_complete_backend.sql`, `0002_source_extra.sql`, and `0003_auth_language.sql` in order. On an existing project apply only missing migrations, once each. `0002_complete_backend.sql` backfills account profiles and protects role changes; `0002_source_extra.sql` preserves source metadata such as scholarly explanations and recitation details; `0003_auth_language.sql` preserves signup language and synchronizes profile language to auth email metadata.

After configuring the API environment, seed from `api/`:

```sh
rtk proxy .venv/bin/python -m scripts.seed --no-embed
```

Seeding inserts new records without reverting database review decisions or instructor edits. Remove `--no-embed` when Bedrock embedding access is configured. Sources stay pending until a scholarly reviewer approves them; the tutor abstains until then.

## Frontend environment

Copy `web/.env.example` to `web/.env.local` and replace placeholders:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLIC_PUBLISHABLE_KEY
NEXT_PUBLIC_API_BASE=http://127.0.0.1:8000
```

A legacy `NEXT_PUBLIC_SUPABASE_ANON_KEY` also works. Restart development after changes. Static production builds require these variables at **build time**; rebuild and redeploy. Leave API_BASE empty when the host routes `/api/*` to FastAPI; otherwise set the backend origin, without `/api`.

## API environment

In `api/.env` or deployment secrets:

```dotenv
ENV=local
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
DATABASE_URL=postgresql://postgres.YOUR_PROJECT_REF:URL_ENCODED_DB_PASSWORD@YOUR_POOLER_HOST:6543/postgres?sslmode=require
ALLOWED_ORIGINS=http://localhost:3100
DEV_ROLE=
```

Copy the actual pooler details from Supabase; hosts vary by project. URL-encode special characters in the password. Set `ENV=prod` and the exact HTTPS frontend origin in production. Multiple CORS origins are comma-separated. Keep DEV_ROLE empty.

Asymmetric JWT signing (ES256/RS256) needs no JWT secret: the API verifies Supabase JWKS. Only legacy HS256 projects require `SUPABASE_JWT_SECRET` on the backend. AWS access is needed for the AI tutor, not login.

## Supabase Auth

Enable **Email** and allow new signups. Keep email confirmation enabled for real users and set the password minimum to at least 8 characters.

In **Authentication → URL Configuration**, set Site URL to the production frontend origin (or `http://localhost:3100` for local testing). Add the exact redirect URLs:

```text
http://localhost:3100/auth/callback/
http://localhost:3100/reset-password/
https://YOUR_FRONTEND_DOMAIN/auth/callback/
https://YOUR_FRONTEND_DOMAIN/reset-password/
```

Replace 3100 everywhere if using another port. Keep trailing slashes. Email confirmation and Google login return to `/auth/callback/`; recovery returns to `/reset-password/`. The static host must serve both exported directories and their `index.html` files. Default email templates using `{{ .ConfirmationURL }}` work; customized templates must preserve the requested redirect.

References: [Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls), [password recovery](https://supabase.com/docs/guides/auth/passwords).

## Google and SMTP

Create a Google OAuth **Web application** client. Add frontend origins to Authorized JavaScript origins and this URI to Authorized redirect URIs:

```text
https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback
```

Enable Google in Supabase providers and enter the client ID/secret there. For a Google consent app in testing, add the intended accounts as test users. [Google setup](https://supabase.com/docs/guides/auth/social-login/auth-google).

Configure custom SMTP before testing confirmation/reset delivery to non-team users; the default mail service restricts recipients and delivery rates. [SMTP setup](https://supabase.com/docs/guides/auth/auth-smtp).

Signup offers English or Arabic and saves `user_metadata.lang`. The localized native Supabase templates in `supabase/templates/localized/supabase-auth.json` use that metadata to send one language, with English as the fallback. Changing the account language updates future email language. Configure SMTP first, then paste each subject/body into its corresponding Supabase email template. Keep the Supabase template variables intact.

The actual live configuration and future `yaqin.org` DNS records are recorded in [AUTH_LIVE_CONFIG.md](AUTH_LIVE_CONFIG.md).

## Staff roles

New profiles default to learner. Promote a trusted account through the Supabase SQL editor:

```sql
update public.profiles set role = 'reviewer' where id = 'YOUR_REVIEWER_AUTH_USER_UUID';
-- Or role = 'instructor' for lesson authors.
```

Browser clients cannot change their role. Reviewers approve verified sources in Instructor, then publish submitted lessons.

## Verify the real project

`GET /api/health` must show `store: "postgres"` and `db: true`.

Check signup → confirmation → login; Google login; logout/login; forgot password → recovery form → login with the new password. Complete a lesson as a guest, sign up, and verify progress on another device. Check two users cannot access each other's progress or change roles. Save and submit an instructor draft, approve sources as a reviewer, publish it, and verify it appears without a frontend rebuild.

`supabase/tests/backend_rls.sql` provides transactional checks of ownership, role protection and progress merging; its test data is rolled back.

Local checks do not verify live credentials, Google consent settings, redirect URLs or SMTP delivery.

Local validation: `rtk proxy .venv/bin/python -m pytest -q` in api; `rtk npm run check:progress`, `rtk npm run lint`, and `rtk proxy npm run build -- --webpack` in web.
