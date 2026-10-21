# CivicPilot 🏛️

> **Autonomous AI-Powered Civic Complaint Management & Resolution Platform**  
> *Hardened & Audited • Next.js 16 • Gemini 3.8 Flash • Supabase • n8n • Tailwind CSS*

**Current status (October 2026):** Web reporting, tracking, role-based staff authentication, officer review queue, municipal analytics, SLA watchdog, private evidence storage, multilingual UI (English, Hindi, Kannada), and Supabase persistence are fully implemented and verified. Both in-app deterministic routing and external n8n workflow intake are supported.

---

## 🌟 Executive Overview

CivicPilot transforms municipal operations from reactive ticketing into an **autonomous civic triage engine**. When citizens report infrastructure failures—such as potholes, bursting pipelines, or dark streetlights—CivicPilot handles the complete complaint lifecycle:

1. **Intake & Rate-Limited Validation**: Ingests citizen reports with location, GPS coordinates, and photo evidence. Protected by client IP sliding-window rate limiting (30 requests/min).
2. **PII Sanitization & AI Extraction**: Masks personal data before calling LLMs and invokes **Google Gemini 3.8 Flash** to extract category, subcategory, severity (1–5), confidence, and safety flags using a strict JSON schema.
3. **2-Stage Deduplication**: Detects and links matching duplicate complaints at the same location, boosting priority rather than duplicating crews, while preventing false merges across different neighborhoods.
4. **Deterministic Priority Scoring**: Applies a transparent, audited mathematical formula combining severity, safety flags, crowd frequency, and SLA urgency.
5. **Department Routing**: Dispatches tasks to municipal departments (Roads, Sanitation, Water, Electrical, Public Safety) or the Ombudsman fallback queue.
6. **Human-in-the-Loop Review**: Routes low-confidence (<0.70) or ambiguous cases to an officer workstation for review before field release.
7. **SLA Monitoring & Automated Escalation**: Watches deadlines and escalates overdue tickets through tiered departmental hierarchies.
8. **Resolution & Feedback Verification**: Records field repair evidence and enables citizens to verify closure or automatically reopen unresolved issues.

---

## 👥 Citizen vs City Staff Role Differentiation

CivicPilot enforces strict interface and permission boundaries between public citizens and municipal operations personnel.

### 1. Citizen Experience (Public / Default)
- **Top Navigation Bar**: Citizens see only citizen-facing tools:
  - **Dashboard** (`/`): City service overview, recent public complaints, category distribution, and submission CTAs.
  - **Report an Issue** (`/submit`): Public filing form with photo upload, geolocation, and multilingual support.
  - **Track Complaints** (`/complaints`): Public ticket tracking docket.
- **Top-Bar Staff Login**: A dedicated **"Staff Login"** button is visible in the top bar for municipal personnel to authenticate.
- **Hidden Staff Features**: Citizens cannot see or access the **Review Queue**, **Analytics**, or **Staff Tools** dropdown.
- **Complaint Details** (`/complaints/[id]`): Citizens see the public complaint summary, event timeline, and their private **Citizen Verification & Feedback** card to submit satisfaction ratings (1–5 stars) and reopen persistent issues upon resolution. Internal operations controls (status modification, department reassignment, resolution notes) are hidden from citizens.
- **Route Gating (`StaffGate`)**: If an unauthenticated user navigates directly to `/review` or `/analytics`, an access gate explains that the area is restricted to city teams and provides an immediate sign-in button.

### 2. City Teams & Staff Experience (Authenticated)
- **Top Bar Authentication**: Officers click **"Staff Login"** in the top navigation bar and enter their **Officer ID / Call-Sign** (e.g. `officer-1`, `roads-crew`) and **Authorization Passkey** (`REVIEWER_SECRET_KEY`).
- **Staff Workstation Capabilities**:
  - **STAFF Brand Badge**: An emerald badge appears beside the brand logo indicating an authenticated municipal session.
  - **Review Queue** (`/review`): An officer triage queue with real-time pending ticket count badges. Officers can approve AI triage, modify categories/departments/priorities, or reject invalid complaints.
  - **Analytics & Audit Logs** (`/analytics`): Department workload distribution, SLA breach metrics, AI confidence distributions, and append-only system audit trails.
  - **Staff Tools Dropdown**: One-click actions to run the automated **SLA Escalation Watchdog** or trigger a **Demo Reset**.
  - **Operational Controls** on ticket detail views (`/complaints/[id]`): Officers can transition ticket status (`open`, `in_progress`, `resolved`, `closed`, `rejected`), reassign pilot queues, log resolution rationale, and attach completion evidence photos.
  - **Session Management**: Session credentials persist in browser session storage (`civicpilot:staff-secret`, `civicpilot:staff-id`) and can be terminated at any time via the **Sign Out** button in the officer pill.

---

## 🚀 Quick Start (Zero-Setup Demo Mode)

CivicPilot includes an in-memory demo mode (`DEMO_MODE=true`) for testing the web journey without external credentials. Set `INTAKE_PROCESSING_MODE=in_app` when n8n is not running.

### 1. Prerequisites
- **Node.js**: v18+ (tested on Node.js 24)
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

### 3. Environment Variables Configuration (`.env.local`)

```env
# Application Mode
DEMO_MODE=true                      # Set to 'false' to connect with Supabase
INTAKE_PROCESSING_MODE=in_app       # 'in_app' for internal triage, 'n8n' for webhook triage

# Staff & Administrative Authentication
REVIEWER_SECRET_KEY=your-staff-passkey-here
ADMIN_API_KEY=your-admin-key-here
CRON_SECRET=your-cron-secret-here

# Google Gemini AI Model
GEMINI_API_KEY=your-gemini-api-key
GEMINI_MODEL=gemini-3.8-flash

# Supabase Database & Storage (Required when DEMO_MODE=false)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-supabase-anon-key
SUPABASE_SECRET_KEY=your-supabase-service-role-key

# n8n Automation Engine (Required when INTAKE_PROCESSING_MODE=n8n)
N8N_INTAKE_WEBHOOK_URL=http://localhost:5678/webhook/civicpilot-intake
N8N_WEBHOOK_SECRET=your-shared-webhook-secret
```

### 4. Running the Application

```bash
# Start Next.js development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser:
- To test the **Citizen journey**: Submit a report via `/submit` and view public tickets on `/complaints`.
- To test the **Staff journey**: Click **Staff Login** in the top bar and enter `officer-1` with your configured `REVIEWER_SECRET_KEY`.

### 5. Running the Test Suite

CivicPilot includes an automated **35-scenario acceptance, security, and integration test suite**:

```bash
npm test
```

Expected result:
```
================================================================
🏁 TEST RESULTS: 104 PASSED | 0 FAILED
================================================================
```

---

## 🔒 Hardened Security & Reliability Architecture

Following a thorough security and storage audit, CivicPilot implements the following controls:

### 1. Rate-Limited Staff Authentication (`POST /api/auth/staff`)
- Authenticates municipal staff passkeys using timing-safe comparisons against `REVIEWER_SECRET_KEY` and `ADMIN_API_KEY`.
- Protected by sliding-window rate limiting to prevent credential brute-force attempts.
- Returns officer role (`reviewer` or `admin`) and sets up authorized browser sessions.

### 2. Server-Side Reviewer Authorization (`POST /api/review`)
- Hardcoded reviewer passcodes are completely eliminated.
- Validates a reviewer or admin key via `x-reviewer-secret` header or authenticated body field.
- Returns `401 Unauthorized` if invalid and `500 Server Error` if staff keys are unconfigured.
- Enforces state machine validation: tickets not in `pending_review` cannot be evaluated.

### 3. Protected Administrative Reset (`POST /api/seed`)
- Unauthenticated users cannot trigger data resets.
- Requires `x-admin-key: <ADMIN_API_KEY>`. Unauthenticated requests return `401 Unauthorized`.

### 4. Audited Supabase RLS Policies
- Anonymous public `anon` role SELECT/INSERT access revoked on all sensitive tables (`complaints`, `complaint_events`, `ai_decisions`, `review_actions`, `notifications`).
- Anonymous public access is restricted strictly to reading active `departments`.
- All docket mutations and privileged queries execute server-side via `SUPABASE_SECRET_KEY`.

### 5. Storage Correctness & Zero Silent Fallback
- `StorageService` strictly respects `DEMO_MODE`.
- When `DEMO_MODE=false`, all operations route directly to Supabase PostgreSQL.
- **No Silent Fallback**: If Supabase credentials are missing or the database fails, the server throws an explicit 500 error instead of silently falling back to ephemeral memory.
- In-memory demo mode is explicitly labelled as `Non-Durable` in the UI and logs.

### 6. Truthful Notification Delivery
- Simulated notifications are recorded with `status: 'simulated'`, `delivered_at: null`, and `failure_reason: 'Simulated dispatch in demo mode'`.
- Notifications are only labelled `delivered` when an external provider returns HTTP 200.

### 7. Intake Rate Limiting & Input Validation
- Sliding-window in-memory rate limiter on `POST /api/intake` (30 requests/minute per client IP).
- Strict bounds validation: description length (5–5000 chars), coordinate limits (`latitude` [-90, 90], `longitude` [-180, 180]), image URL schemes (`http`, `https`, `evidence://`).

---

## 🤖 n8n Automation Workflows

Importable workflow definitions are stored in `n8n/workflows/`:

1. **Complaint Intake** (`POST /webhook/civicpilot-intake`):
   - Validates incoming payload.
   - Invokes **Gemini 3.8 Flash** node for multilingual civic classification.
   - Forwards to authenticated internal endpoint `POST /api/internal/intake-persist` with shared secret.
   - Persists the real database ticket record and returns consistent database IDs and ticket numbers.
2. **Human Review Action** (`POST /webhook/civicpilot-review`):
   - Requires valid `x-reviewer-secret` header.
   - Mutates persistent docket record and emits `review_action` audit event.
3. **SLA Escalation Watchdog** (`POST /webhook/civicpilot-sla` or cron schedule):
   - Evaluates overdue tickets and updates persistent escalation tiers idempotently.
4. **Notifications** (`POST /webhook/civicpilot-notify`):
   - Routes through configured delivery channel (Email / Telegram) and truthfully logs delivery status.
5. **Resolution Feedback** (`POST /webhook/civicpilot-feedback`):
   - Validates citizen ratings and auto-reopens tickets if citizen reports issue persists.

### Running n8n Locally:

- **Via Docker Compose**:
  ```bash
  docker compose up -d n8n
  ```
- **Via Local Node/PowerShell**:
  ```powershell
  powershell -ExecutionPolicy Bypass -File scripts\start-n8n-local.ps1
  ```
Access the n8n UI at `http://localhost:5678`.

---

## 📋 Honest Live Integration Matrix

| Integration | Demo Mode Status (`DEMO_MODE=true`) | Live Production Status (`DEMO_MODE=false`) | Required Credentials |
|---|---|---|---|
| **Storage / DB** | ✅ Verified (In-Memory, Non-Durable) | ✅ Verified (Supabase PostgreSQL with RLS) | `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SECRET_KEY` |
| **AI Triage** | ✅ Verified (Deterministic Rule Fallback) | ✅ Verified (Gemini 3.8 Flash with Multilingual Support) | `GEMINI_API_KEY`, `GEMINI_MODEL` |
| **Staff Auth** | ✅ Verified (In-memory & SessionStorage) | ✅ Verified (Timing-safe Key Verification & Rate Limiter) | `REVIEWER_SECRET_KEY`, `ADMIN_API_KEY` |
| **n8n Automation** | ✅ Internal API Tested | ✅ Verified with Webhook & Internal Persist Endpoint | `N8N_INTAKE_WEBHOOK_URL`, `N8N_WEBHOOK_SECRET` |
| **Media Storage** | ✅ Verified (Local Base64 & Blob) | ✅ Verified (Supabase Private `civic-evidence` bucket) | `SUPABASE_SECRET_KEY` |
| **Email Alerts** | ✅ Verified (Recorded as `status='simulated'`) | 🟡 Ready for Provider Binding | `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` |
| **Telegram Alerts** | ✅ Verified (Recorded as `status='simulated'`) | 🟡 Ready for Bot Binding | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_OFFICER_CHAT_ID` |

---

## 📦 Deployment Instructions (Vercel)

See [DEPLOY_VERCEL.md](DEPLOY_VERCEL.md) for detailed production deployment checklists.

1. Push this repository to your GitHub account.
2. Import the project into [Vercel](https://vercel.com).
3. Configure Environment Variables:
   - `DEMO_MODE=false`
   - `REVIEWER_SECRET_KEY` and `ADMIN_API_KEY`
   - `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - `SUPABASE_SECRET_KEY`
   - `GEMINI_API_KEY` and `GEMINI_MODEL=gemini-3.8-flash`
   - `N8N_INTAKE_WEBHOOK_URL` and `N8N_WEBHOOK_SECRET`
4. Run `npm test` to verify acceptance suites before deploying to production.

