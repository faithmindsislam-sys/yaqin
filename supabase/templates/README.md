# Yaqin authentication email drafts

Prepared only. All 14 Resend templates remain **drafts**. No emails were sent, no templates were published, and no Supabase Auth, SMTP, notification, redirect, or application settings were changed.

Every template contains English followed by Arabic with right-to-left layout, a bilingual subject, Yaqin's teal palette, and a plain-language account security note. No unverified sender, support email, or link expiration duration is hardcoded.

## Review

Open `preview.html` in a browser for desktop/mobile sample previews. The sandboxed preview disables action links and uses fake data. The dropdown covers all 14 templates.

`templates.json` contains subjects, file names, Supabase template keys, Resend draft links, and required variables. Resend drafts contain the verified HTML and plain-text versions. The MCP visual editor reported successful saves but returned empty content, so the prepared HTML was restored and read back exactly; drafts use HTML mode. `resend-drafts.json` is a local content backup (HTML, text, editor document).

| Template | Supabase slot | Resend draft |
| --- | --- | --- |
| confirm-signup | `confirmation` | [Review draft](https://resend.com/templates/7b4db5a1-de61-43f6-a1f9-15bc20f645a8) |
| sign-in | `magic_link` | [Review draft](https://resend.com/templates/b1a6615a-2697-49ab-92ee-0bc261babbae) |
| sign-in-otp | Alternative body for `magic_link` | [Review draft](https://resend.com/templates/6f824cd2-d4e1-4002-9f30-53302d779029) |
| reset-password | `recovery` | [Review draft](https://resend.com/templates/76c438c7-db5c-405a-b38d-a4858f4d3fd0) |
| invitation | `invite` | [Review draft](https://resend.com/templates/297c317f-6d69-4d18-b5db-9a97f0356d24) |
| change-email | `email_change` | [Review draft](https://resend.com/templates/0db0d92a-7377-4c27-bfc3-cd2fb55f2eb8) |
| reauthentication | `reauthentication` | [Review draft](https://resend.com/templates/fa1dca75-89c1-44ac-999e-c4e5a031c93b) |
| password-changed | `password_changed_notification` | [Review draft](https://resend.com/templates/609e08b0-2d8d-4e18-a097-dcf91860d939) |
| email-changed | `email_changed_notification` | [Review draft](https://resend.com/templates/5063b2ee-2ae0-4f71-bd8c-c59d88be658e) |
| phone-changed | `phone_changed_notification` | [Review draft](https://resend.com/templates/e601c291-4e8b-4d44-9080-0a9a211b3b2b) |
| sign-in-method-linked | `identity_linked_notification` | [Review draft](https://resend.com/templates/72e5d7b0-dddc-4408-86f9-61553c0cdfd3) |
| sign-in-method-removed | `identity_unlinked_notification` | [Review draft](https://resend.com/templates/c3d1afd1-3d69-4303-ab8d-38d89c078d10) |
| verification-method-added | `mfa_factor_enrolled_notification` | [Review draft](https://resend.com/templates/b2ea477c-d4ea-4102-b15b-709c80349370) |
| verification-method-removed | `mfa_factor_unenrolled_notification` | [Review draft](https://resend.com/templates/73db0a72-b64d-4395-b655-20c46fd08095) |

## Prepared Supabase copies

The individual HTML files use Supabase Go template variables, including `{{ .ConfirmationURL }}`, `{{ .Token }}`, and notification-specific fields. Preserve `ConfirmationURL`: Supabase generates the verification URL with the redirect requested by the app.

`supabase-auth-draft.json` is an **unapplied** Management API template/subject payload. It contains no notification enablement flags and has not been sent to Supabase. There is no Auth-template configuration tool in the connected Supabase MCP; the MCP was used to confirm the project and check its documented Auth variables.

The sign-in-code email is an alternative for the magic-link slot, not an additional Supabase event. It is not included in the draft configuration payload. The current app uses email/password login and Google OAuth; neither sends a normal sign-in email. Its existing email flows are sign-up confirmation and forgot-password recovery. Magic-link/OTP login, invitations, email changes, reauthentication, phone changes, and MFA templates are prepared for those flows if enabled later; no application flow was added.

Security notifications are sent only when their corresponding Supabase project settings are enabled. They are still drafts here.

## Resend variable mapping

Supabase and Resend use different template engines. Resend copies use triple-brace variables, supplied by the caller:

| Supabase | Resend |
| --- | --- |
| `{{ .ConfirmationURL }}` | `{{{CONFIRMATION_URL}}}` |
| `{{ .SiteURL }}` | `{{{SITE_URL}}}` |
| `{{ .Token }}` | `{{{TOKEN}}}` |
| `{{ .NewEmail }}` | `{{{NEW_EMAIL}}}` |
| `{{ .OldEmail }}` | `{{{OLD_EMAIL}}}` |
| `{{ .Email }}` | `{{{ACCOUNT_EMAIL}}}` |
| `{{ .OldPhone }}` | `{{{OLD_PHONE}}}` |
| `{{ .Phone }}` | `{{{PHONE}}}` |
| `{{ .Provider }}` | `{{{PROVIDER}}}` |
| `{{ .FactorType }}` | `{{{FACTOR_TYPE}}}` |

`CONFIRMATION_URL` must come from Supabase for the particular auth event; `TOKEN` must be that event's actual OTP. `SITE_URL` must be the configured trusted app origin. Never use preview values for real authentication. Escape user-controlled text variables as HTML before substitution into raw Resend HTML.

Using Resend as Supabase SMTP delivers the HTML configured **in Supabase**; it does not automatically select these Resend API template drafts. Using Resend API templates requires a separate Send Email hook/integration, which has not been created. No sender defaults were set.

When activating later, preserve the existing `/auth/callback/` signup redirect and `/reset-password/` recovery redirect. Disable email link tracking for authentication links so the provider does not rewrite them. Test delivery and verification with a real staging account after configuration; this task performed template preparation only.

Sources: [Supabase Auth email templates](https://supabase.com/docs/guides/auth/auth-email-templates), [Resend templates](https://resend.com/docs/dashboard/templates/introduction).
