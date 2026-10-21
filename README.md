# CivicPilot 🏛️

> **Autonomous AI-Powered Civic Complaint Management & Resolution Platform**  
> *Hardened & Audited • Next.js 16 • Gemini 3.6 Flash • Supabase • n8n • Tailwind CSS*

**Current status (21 October 2026):** The web reporting, tracking, staff review, analytics, private evidence, multilingual UI, and mock agency flows are implemented for the Bengaluru pilot. WhatsApp integration is paused. Demo mode is in-memory and does not preserve reports after restart. Public deployment still requires hosted services and the launch checks in [CIVICPILOT_SPEC.md](CIVICPILOT_SPEC.md).

---

## 🌟 Executive Overview

CivicPilot transforms municipal operations from reactive ticketing into an **autonomous civic triage engine**. When citizens report infrastructure failures—such as potholes, bursting pipelines, or dark streetlights—CivicPilot handles the complete complaint lifecycle:

1. **Intake & Rate-Limited Validation**: Ingests citizen reports with location, GPS coordinates, and photo evidence. Protected by client IP sliding-window rate limiting (30 requests/min).
2. **PII Sanitization & AI Extraction**: Masks personal data before calling LLMs and invokes **Google Gemini 3.6 Flash** to extract category, subcategory, severity (1–5), confidence, and safety flags using a strict JSON schema.
3. **2-Stage Deduplication**: Detects and links matching duplicate complaints at the same location, boosting priority rather than duplicating crews, while preventing false merges across different neighborhoods.
4. **Deterministic Priority Scoring**: Applies a transparent, audited mathematical formula combining severity, safety flags, crowd frequency, and SLA urgency.
5. **Department Routing**: Dispatches tasks to municipal departments (Roads, Sanitation, Water, Electrical, Public Safety) or the Ombudsman fallback queue.
6. **Human-in-the-Loop Review**: Routes low-confidence (<0.70) or ambiguous cases to an officer workstation for review before field release.
7. **SLA Monitoring & Automated Escalation**: Watches deadlines and escalates overdue tickets through tiered departmental hierarchies.
8. **Resolution & Feedback Verification**: Records field repair evidence and enables citizens to verify closure or automatically reopen unresolved issues.

---

## 🚀 Quick Start (Zero-Setup Demo Mode)

CivicPilot includes an in-memory demo mode (`DEMO_MODE=true`) for testing the web journey without external credentials. Set `INTAKE_PROCESSING_MODE=in_app` when n8n is not running.

### 1. Prerequisites
- **Node.js**: v18+ (verified on Node.js 24)
- **npm**: v9+ (or pnpm / yarn)
- **Docker** *(Optional, for local self-hosted n8n)*

### 2. Installation & Setup

```bash
# Clone repository
git clone https://github.com/Abhijeet-ojha/hacksprint.git
cd hacksprint

# Install dependencies
npm install

# Copy environment template
cp .env.example .env.local
```

### 3. Running the Hardened Application

```bash
# Development mode
npm run dev

# Production build and run
npm run build
npm run start
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### 4. Running the Automated Acceptance & Security Regression Test Suite

CivicPilot includes a **36-scenario acceptance and security test suite** for the implemented flows:

```bash
npm test
```

The current suite reports 112 passing assertions across 36 scenarios.

### Citizen and staff views

Residents see a report form and a private **My reports** page. A new web submission returns a ticket number and a private tracking code, saved on that browser. To reopen it elsewhere, enter both on **Track your report**. The code grants access to that one report, its redacted timeline, and its photos. Treat the code like a password: anyone who has it can see that report. **Forget on this device** removes the browser copy. A ticket number alone never opens a report. Existing tickets issued before tracking codes cannot be recovered through this screen; staff must arrange a verified recovery process.

Pilot staff sign in with the configured reviewer or admin key. Their dashboard, all-reports list, review queue, analytics, audit log, and full ticket details cover every report. Staff can update status and queue assignments; only admins can reset demo data. This shared-key sign-in is a pilot control, not individual staff identity. Replace it with named accounts and server-managed sessions before a public launch. Citizen tracking codes and staff keys are sent in request headers, never in page URLs.

---

## 🔒 Hardened Security & Reliability Architecture

Following a thorough security and storage audit, CivicPilot implements the following controls:

### 1. Server-Side Reviewer Authorization
- Hard-coded reviewer passcodes were removed from all API endpoints.
- `POST /api/review` validates a reviewer or admin key via `x-reviewer-secret` (or the existing body field).
- Returns `401 Unauthorized` if invalid, and `500 Server Error` if both staff keys are unconfigured.
- Enforces state machine validation: cannot review tickets that are not in a pending review state.

### 2. Protected Administrative Reset (`POST /api/seed`)
- Unauthenticated users cannot trigger data resets.
- Every mode requires `x-admin-key: <ADMIN_API_KEY>`. Unauthenticated requests return `401 Unauthorized`.

### 3. Audited Supabase RLS Policies
- Anonymous public `anon` role SELECT/INSERT access revoked on all sensitive citizen tables (`complaints`, `complaint_events`, `ai_decisions`, `review_actions`, `notifications`).
- Anonymous public access is restricted strictly to reading active `departments`.
- All docket mutations and privileged queries execute server-side via `SUPABASE_SECRET_KEY` (or a legacy `SUPABASE_SERVICE_ROLE_KEY`).

### 4. Storage Correctness & Zero Silent Fallback
- `StorageService` strictly respects `DEMO_MODE`.
- When `DEMO_MODE=false`, all reads, writes, audit trails, and analytics are routed directly to Supabase.
- **No Silent Fallback**: If Supabase credentials are missing or the database fails, the server throws an explicit 500 error instead of silently falling back to ephemeral memory.
- In-memory demo mode is explicitly labelled as `Non-Durable` in the UI and code.

### 5. Truthful Notification Delivery
- Simulated notifications are recorded with `status: 'simulated'`, `delivered_at: null`, and `failure_reason: 'Simulated dispatch in demo mode'`.
- Notifications are only labelled `delivered` when an external provider returns HTTP 200.

### 6. Rate Limiting & Input Validation
- Sliding-window in-memory rate limiter on `POST /api/intake` (30 requests/minute per client IP).
- Strict bounds validation: description length (5–5000 chars), coordinate limits (`latitude` [-90, 90], `longitude` [-180, 180]), image URL schemes (`http`, `https`, `data:image/`).

---

## 🤖 n8n Automation Workflows

Importable workflow definitions are stored in `n8n/workflows/`:

1. `complaint-intake.json` (`POST /webhook/civicpilot-intake`)
   - Validates incoming payload.
   - Forwards to authenticated internal endpoint `POST /api/internal/intake-persist` with shared secret.
   - Persists the real database ticket record and returns consistent database IDs and ticket numbers (no mock random numbers).
2. `human-review.json` (`POST /webhook/civicpilot-review`)
   - Requires valid `x-reviewer-secret` header.
   - Mutates persistent docket record and emits `review_action` audit event.
3. `sla-escalation.json` (`POST /webhook/civicpilot-sla` or cron schedule)
   - Evaluates overdue tickets and updates persistent escalation tiers idempotently.
4. `notifications.json` (`POST /webhook/civicpilot-notify`)
   - Routes through configured delivery channel and truthfully logs delivery status.
5. `resolution-feedback.json` (`POST /webhook/civicpilot-feedback`)
   - Validates citizen ratings and auto-reopens tickets if citizen reports issue persists.

### Running n8n with Docker Compose:

```bash
docker compose up -d n8n
```
Access the n8n UI at `http://localhost:5678`, navigate to **Workflows → Import from File**, and select files from `./n8n/workflows/`.

---

## 📋 Honest Live Integration Matrix

| Integration | Demo Mode Status (`DEMO_MODE=true`) | Live Production Status (`DEMO_MODE=false`) | Live Credentials Needed |
|---|---|---|---|
| **Storage / DB** | ✅ Verified (In-memory, Non-Durable) | ✅ Bengaluru Supabase pilot verified with synthetic intake and private evidence | `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SECRET_KEY` |
| **AI Triage** | ✅ Verified (Deterministic Rule Fallback) | ✅ Local Gemini 3.6 Flash intake verified with a Kannada synthetic report; hosted deployment pending | `GEMINI_API_KEY` on the deployed app and n8n |
| **n8n Workflows** | 🟡 Internal app endpoint tested | 🟡 Local intake published and verified with web report and private photo; six other workflows and hosted n8n pending | `N8N_WEBHOOK_SECRET`; Meta credentials for WhatsApp |
| **Email Alerts** | ✅ Verified (Recorded with `status='simulated'`) | 🟡 Ready for Configuration | `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` |
| **Telegram Alerts** | ✅ Verified (Recorded with `status='simulated'`) | 🟡 Ready for Configuration | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_OFFICER_CHAT_ID` |

---

## 📦 Deployment Instructions (Vercel)

See [DEPLOY_VERCEL.md](DEPLOY_VERCEL.md) for the Vercel preview setup, exact environment variables, and checks before a public pilot.

1. Push this repository to GitHub.
2. Import project into [Vercel](https://vercel.com).
3. Configure Environment Variables from `.env.example`:
   - `DEMO_MODE=false` (for cloud services)
   - `ADMIN_API_KEY` and `REVIEWER_SECRET_KEY`
   - `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - `SUPABASE_SECRET_KEY` (server only)
   - `GEMINI_API_KEY`
4. Run `npm run build`, `npm run lint`, `npm test`, and `npm run test:channels`. Verify the hosted Supabase and n8n flows with synthetic reports before opening intake to users.
