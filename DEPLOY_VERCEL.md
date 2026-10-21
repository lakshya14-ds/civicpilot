# CivicPilot on Vercel

## Deployment boundary

Vercel hosts the Next.js web app and API. Supabase holds durable tickets and private photos. A local n8n URL such as `localhost:5678` cannot serve a Vercel deployment. WhatsApp is paused. The government connector stays in mock mode until an agency approves access.

Do not use `DEMO_MODE=true` on Vercel: its in-memory reports can disappear between requests. A preview can run web intake directly in the app with `INTAKE_PROCESSING_MODE=in_app`. Use `n8n` mode only after a hosted HTTPS n8n intake workflow and its callback to the Vercel app have both been verified.

## Before creating a preview

1. Check the Supabase schema, six pilot queues, private `civic-evidence` bucket, and service key against `supabase/SETUP_BENGALURU.sql`.
2. Import the GitHub repository `lakshya14-ds/civicpilot` into Vercel. Its Git root is the Next.js app root; choose the Next.js framework preset and leave Root Directory at `./`.
3. Add these variables to the Vercel **Preview** environment. Copy their values from the ignored local `.env.local`; never paste them into Git, a chat message, or a public screenshot.

| Variable | Preview value or source |
| --- | --- |
| `DEMO_MODE` | `false` |
| `INTAKE_PROCESSING_MODE` | `in_app` until hosted n8n is ready |
| `NEXT_PUBLIC_SUPABASE_URL` | Existing Bengaluru Supabase URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Existing publishable key |
| `SUPABASE_SECRET_KEY` | Existing server key; mark Sensitive |
| `GEMINI_API_KEY` | Existing Gemini key; mark Sensitive |
| `GEMINI_MODEL` | `gemini-3.6-flash` |
| `ADMIN_API_KEY` | Generated local admin key; mark Sensitive |
| `REVIEWER_SECRET_KEY` | Generated local reviewer key; mark Sensitive |
| `FEEDBACK_SECRET_KEY` | Existing feedback key; mark Sensitive |
| `CRON_SECRET` | Generated local cron key; mark Sensitive |
| `GOVERNMENT_ADAPTER` | `mock` |
| `GOVERNMENT_INTEGRATION_ENABLED` | `false` |

`N8N_WEBHOOK_SECRET` and a hosted `N8N_WEBHOOK_INTAKE_URL` are required when switching intake to `n8n`. Keep their values synchronized with the hosted workflow. Do not copy the local `http://localhost:5678/...` URL into Vercel.

## Preview checks

1. Run `npm run lint`, `npm test`, `npm run test:channels`, and `npm run build` locally.
2. Deploy a Vercel preview and open the dashboard. Confirm the storage banner says durable Supabase, not demo memory.
3. Submit a synthetic Kannada road report with a small photo, save its ticket number, reload the ticket page, and verify that the photo is private. Repeat with Hindi and English text.
4. Open the site as a citizen: confirm that no all-reports list, staff dashboard, review queue, or analytics is visible. A ticket number alone must fail; the ticket's private code must open only that ticket. Check another ticket with the same code returns 401. Confirm citizen responses omit contact details and other reports. Check unauthorized list, analytics, audit, review, escalation, and reset requests fail.
5. Resolve a synthetic ticket with an authorized reviewer key; check timeline and feedback, then clean up the synthetic records.
6. Inspect Vercel function logs for errors. Repeat the same tests after connecting hosted n8n. The current 4 MB web photo limit leaves room below Vercel's function request limit.

## Production gate

Create a production deployment only after staff identity and roles, distributed rate limiting, a reviewed privacy/retention and deletion policy, monitoring, backup and restore checks, accessibility and Kannada language review, and a named pilot owner are in place. An official government reference may be shown only after the agency authorizes the connector and returns that reference. See `CIVICPILOT_SPEC.md` for the full pilot boundary.
