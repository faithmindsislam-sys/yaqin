# Live authentication configuration

Project account: `faithmindsislam@gmail.com`.
Supabase project: `okcctzpfpreziuxnyepk`.
Current website: `https://d1x2w48x0bzbrs.cloudfront.net`.
Future website: `https://yaqin.org` (not purchased/connected yet).

Supabase migrations `0002_complete_backend.sql` and `0003_auth_language.sql` have been applied. The browser publishable key and URL are configured privately in `web/.env.local`. Restart/rebuild with that configuration before deploying.

The live Site URL is the current CloudFront website. Exact `/auth/callback/` and `/reset-password/` redirects are configured for that website, `localhost:3000`, `localhost:3100`, and `127.0.0.1:3100`.

Signup saves `user_metadata.lang` as `en` or `ar`. The signup trigger sets `profiles.lang`, and profile language changes update the email metadata. Localized versions of the email agent's original drafts are in `supabase/templates/localized/`; English is the fallback when the language is absent. The original bilingual drafts are preserved.

## Email domain to activate after purchase

`yaqin.org` is registered in the Resend dashboard in Ireland, domain ID `5b635ab0-313c-404d-8d6c-720af17df899`, awaiting DNS verification. These values came from its DNS setup screen:

| Type | Host | Value | TTL |
| --- | --- | --- | --- |
| TXT | `resend._domainkey` | `p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDx/zWbj27TDAdUnlbzt8W4c2RuxR6zxk5Crp1DoPz+pOH410nofqdKC8UXVcrh9rMeXELywpvO7tx81MoFQILKp8m0Mc9fPzE5/zXJEmsHZnLKIlZoR1Va7tLlVQ30zAnv2e/+VJqL2owTcrr385dKndgQnbJMoZ1X54yHAQsRFwIDAQAB` | Auto |
| CNAME | `rsend` | `rsend-euw1.forge.rmta.net` | Auto |
| CNAME | `send` | `send.forge.rmta.net` | Auto |
| TXT | `_dmarc` | `v=DMARC1; p=none;` | Auto |

Recheck the Resend screen before publishing records in case its configuration has changed. Do not enable receiving; it is unnecessary for auth emails. Once verification succeeds, use `noreply@yaqin.org` as the Supabase sender, displayed as `Yaqin · يقين`. The project Gmail address is the support contact in the templates.

SMTP settings: host `smtp.resend.com`, port `465`, username `resend`, password a Resend sending-only API key. Secrets belong in Supabase SMTP settings, never the browser bundle or Git. The temporary sender `onboarding@resend.dev` only delivers to the Resend account's own email, so Yopmail and other users require the verified domain.

After connecting the website domain and HTTPS, change the Supabase Site URL to `https://yaqin.org` and add its exact callback and reset redirects (and `www` only if that hostname will serve the app). Keep the Supabase Google callback `https://okcctzpfpreziuxnyepk.supabase.co/auth/v1/callback`; it does not change with the website domain.

## Live provider configuration (2026-10-02)

Email signup, confirmation, password login, recovery email delivery, recovery-token verification, password update, rejection of the old password, and login with the new password have passed against the live Supabase project using the project Gmail address. Profile-to-email language metadata synchronization has also passed. These tests used Supabase's default sender, not Resend or the localized drafts. Minimum password length is 8.

Google Cloud project `elliptical-feat-510417-u0` was reused. Yaqin branding was created after approved acceptance of Google's User Data Policy. Only `openid`, `userinfo.email`, and `userinfo.profile` are configured; there are no sensitive or restricted scopes. The Web application client `Yaqin Supabase Web` was created with the exact Supabase callback. Its credentials were transferred privately to Supabase, and the Google provider is enabled. The audience remains External / Testing; the app has not been published or had its branding verified. Local Google sign-in works with the existing Faith Minds account.

Custom SMTP is enabled. The approved replacement sending-only, all-domains Resend key `Yaqin Supabase auth SMTP` was created and transferred directly to Supabase. The unused first key was deleted after approval. No secrets were written to the repository. Supabase uses `onboarding@resend.dev`, display name `Yaqin · يقين`, host `smtp.resend.com`, port `465` with implicit TLS, username `resend`, and a 60-second minimum interval. These match [Resend's official SMTP settings](https://resend.com/docs/send-with-smtp).

Resend's Usage screen confirms the Transactional Free plan: 100 emails/day, 3,000/month, and 10 requests/second. These provider quotas are separate from Supabase's configurable Auth email limit. After enabling custom SMTP, Supabase's limit was increased from 30 to 100 emails/hour and verified after reload. The per-user minimum interval remains 60 seconds. Resend's Free plan quotas cannot be increased through this setting; a plan upgrade would require user approval. No paid upgrade or billing setting was changed. See [Resend quotas](https://resend.com/docs/knowledge-base/account-quotas-and-limits) and [Supabase Auth rate limits](https://supabase.com/docs/guides/auth/rate-limits).

All 13 localized subject/body pairs from `supabase/templates/localized/supabase-auth.json` are applied. Each saved body was copied from the editor after reload and matched the prepared file exactly. Subjects were filled from the same file. Existing optional security-notification switches remain off. The original 14 email drafts remain unchanged.

English and Arabic forgot-password requests succeeded locally without the former rate-limit error. Resend marked both emails Delivered, and Gmail received both in Spam. The Arabic delivery event also showed Gmail's `250 2.0.0 OK` SMTP acceptance. The subjects and bodies matched the corresponding locale, and both received links reached the local `/reset-password/` form with a recovery session. The password was not changed during these browser tests: new password entry and submission require the user to take over. The latest reset form was left open for that optional step. Recovery delivery IDs are `01a0fe11-18a4-7221-8c5f-d76cbce5c870` (Arabic) and `01a0fe1a-e7f5-79bb-b1e4-0b8bb478740a` (English).

Fresh confirmation delivery through Resend remains untested. The only real recipient allowed by `onboarding@resend.dev` is the Resend account owner, and that Supabase user was already confirmed. Its dashboard offers recovery and magic-link sending, but no confirmation resend. The existing account was preserved. Once a sending domain is purchased and verified, create a separate signup with an allowed address and test the localized confirmation email and callback. `yaqin.org` is still unpurchased and unverified; it cannot send yet.

The deployed API health endpoint is healthy with PostgreSQL, but `/api/content` and `/api/review/queue` return 404, so it is still running the older code. This computer has no configured AWS credentials and the browser is signed out. Deploy the new web build and API through the existing deployment once AWS access is available. Until then, the new auth pages and language selector are verified locally. Production builds must include the Supabase browser configuration. The backend needs `SUPABASE_URL` and a private `DATABASE_URL` for cloud content/staff APIs; login itself is handled directly by Supabase Auth.

## Local browser verification (2026-10-02)

The running frontend is `http://127.0.0.1:3100`. Its API is `http://127.0.0.1:8000`. The old API process was restarted to load the current code, with reload enabled. Private `api/.env` now sets the real Supabase URL, exact local frontend origins, local mode, and no development role override. The local content store remains in memory because no database connection string is configured; account profiles/progress still use live Supabase directly.

Local API `/api/content` now returns 200, anonymous staff requests return 401, valid learner requests return 403, and invalid tokens return 401. Chrome tests passed for wrong-password rejection, correct-password login, logout, retained login after reload, English/Arabic account preference sync, signup language selection and 8-character minimum, empty-email recovery validation, and disabled password submission without a recovery session.

After the live provider configuration above, Chrome passed Google account selection and basic consent, the local `/auth/callback/`, the Faith Minds learner dashboard, session persistence after reload, logout, and repeat Google login without another consent prompt. English/Arabic preference changes synchronized to `user_metadata.lang`; the original Arabic preference was restored and both email and Google identities remain linked. Resend recovery delivery and both local recovery links passed as described above. AWS deployment remains deferred at the user's request.
