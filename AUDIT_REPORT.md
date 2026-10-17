# CivicPilot Final Security Hardening, Storage Correctness & End-to-End Verification Audit Report

**Date**: October 14, 2026  
**Auditor**: Senior Full-Stack & Application Security Engineer  
**Repository**: [CivicPilot (hacksprint)](https://github.com/Abhijeet-ojha/hacksprint.git)  
**Branch**: `main`  
**Test Evidence**: 96 Automated Assertions Across 32 Scenarios Passed (`npm test`), 0 ESLint Errors (`npm run lint`), Clean Production Build (`npm run build`).

---

## 1. Executive Summary

A comprehensive security, authorization, data persistence, and workflow reliability audit was conducted on the CivicPilot codebase. Rather than merely diagnosing issues, all confirmed vulnerabilities, missing authorization boundaries, silent fallbacks, and state machine discrepancies were repaired directly in the codebase and verified with an expanded automated regression suite.

All existing user interface components, styling, and legitimate product workflows have been preserved. Crucially, the platform now follows fail-closed security principles, eliminates realistic credentials from configuration examples, enforces least-privilege database row-level security (RLS), and protects against header spoofing and concurrent duplicate ingestion race conditions.

---

## 2. Priority & Severity-Ranked Findings & Resolved Issues

| ID | Issue Identified | Severity | Root Cause | Fix Implemented | Files Changed |
|---|---|---|---|---|---|
| **SEC-01** | **Seed/Reset Accessible via Reviewer Credentials** | **Critical** | `POST /api/seed` permitted any caller with `x-reviewer-secret` to trigger a complete database reset. Reviewers should only triage complaints. | Disallowed reviewer credentials (`x-reviewer-secret` now explicitly rejected with `403 Forbidden`). Required dedicated `ADMIN_API_KEY` for resets outside demo mode. Fails closed with 500 if unconfigured. Gated demo resets to `x-demo-reset: civicpilot-demo-confirm`. | `src/app/api/seed/route.ts`, `src/lib/security/auth.ts` |
| **SEC-02** | **Unauthenticated Feedback Route Complaint Mutation** | **Critical** | `POST /api/feedback` allowed any unauthenticated caller possessing an arbitrary complaint UUID to alter ticket status and submit ratings. | Implemented HMAC-SHA256 ticket capability tokens (`generateFeedbackToken` / `verifyFeedbackToken`). Route requires capability token or authenticated staff secret. Enforced state machine constraint: complaints cannot receive feedback unless in `resolved` or `closed` status. | `src/app/api/feedback/route.ts`, `src/app/api/complaints/[id]/route.ts`, `src/lib/security/auth.ts` |
| **SEC-03** | **Permissive Supabase RLS Policies** | **Critical** | Migration granted `authenticated` role unrestricted read and write (`USING (true) WITH CHECK (true)`) on all tables (`complaints`, `events`, `ai_decisions`, `review_actions`, `notifications`). | Replaced policies in `20260102000000_tighten_rls_policies.sql`. Reserved complete management to `service_role`. Scoped `authenticated` staff access strictly to accounts with app metadata roles `('officer', 'admin', 'supervisor')`. Citizens restricted to reading complaints matching their authenticated email. | `supabase/migrations/20260102000000_tighten_rls_policies.sql` |
| **SEC-04** | **Internal Intake Webhook Secret Bypass on Unset** | **High** | In `complaint-intake.json` and `notifications.json`, secret check logic was `if (configuredSecret && providedSecret !== configuredSecret)`. If `$env.N8N_WEBHOOK_SECRET` was unset, unauthorized requests were allowed through. | Enforced fail-closed checks: if secret is unconfigured, workflow throws error immediately. Internal endpoint `/api/internal/intake-persist` returns `500` if secret is unset and `401` if invalid. Constant-time secret comparison implemented via `crypto.timingSafeEqual`. | `n8n/workflows/complaint-intake.json`, `n8n/workflows/notifications.json`, `src/app/api/internal/intake-persist/route.ts`, `src/lib/security/auth.ts` |
| **SEC-05** | **Public SLA Escalation Endpoint Invocation** | **High** | `POST /api/escalate` had no authentication boundary, allowing any anonymous caller to trigger watchdog cycles and spam escalation notifications. | Protected route requiring `CRON_SECRET` (`x-cron-secret` / Bearer token), `ADMIN_API_KEY`, or `REVIEWER_SECRET_KEY`. Client-controlled role headers (`x-user-role`, `x-role`) are ignored. | `src/app/api/escalate/route.ts`, `src/components/Navbar.tsx` |
| **SEC-06** | **Reviewer Route Authentication Ordering & Timing Leak** | **Medium** | `POST /api/review` validated input payload before checking authorization, leaking validation errors to unauthenticated attackers and using non-constant-time equality (`!==`). | Moved authentication to Step 1 with `constantTimeCompare`. Validates review actions against allowed set (`approved`, `rejected`, `modified`). Enforces ticket state eligibility (`pending_review`). Added client rate limiting (30 req/min). | `src/app/api/review/route.ts` |
| **SEC-07** | **Silent Fallback to In-App Triage in n8n Mode** | **Medium** | Setting `INTAKE_PROCESSING_MODE=n8n` silently fell back to in-app triage heuristics if n8n webhook URLs were missing. | Refactored `src/lib/triage/orchestrator.ts` to strictly validate required n8n webhook URL and secret, throwing explicit configuration errors rather than masking configuration failure. | `src/lib/triage/orchestrator.ts` |
| **SEC-08** | **Concurrency & Duplicate Key Race Conditions** | **Medium** | Duplicate webhook retries or simultaneous identical requests could trigger uncaught database unique violations (`23505`) on `idempotency_key`, resulting in 500 errors. | Wrapped Supabase insertion in `StorageService.createComplaint` to catch `23505` unique violations on `idempotency_key` and query/return the existing record atomically. Added race condition check in memory store. | `src/lib/db/storage.ts` |
| **SEC-09** | **Spoofed IP Rate Limiting Bypass** | **Medium** | `rateLimit.ts` blindly extracted the first IP from `x-forwarded-for`, allowing clients to spoof rate limit identities. | Hardened IP extraction prioritizing trusted provider headers (`cf-connecting-ip`, `x-vercel-forwarded-for`, `x-real-ip`) and sanitizing IP strings. | `src/lib/security/rateLimit.ts` |
| **SEC-10** | **Realistic Credentials in Environment Template** | **Low** | `.env.example` contained realistic-looking default secrets (`civicpilot-admin-secret-replace-in-production`, etc.). | Replaced all credentials with empty strings, documented required variables per mode, and resolved `N8N_WEBHOOK_SECRET` vs `WEBHOOK_SHARED_SECRET` aliasing. | `.env.example` |
| **SEC-11** | **Stale Environment Variable Reads in Supabase Client** | **Low** | `src/lib/db/supabase.ts` read `process.env` at module evaluation time, preventing dynamic configuration updates. | Refactored `isSupabaseConfigured()`, `getServerSupabase()`, and `getPublicSupabase()` to read `process.env` dynamically. | `src/lib/db/supabase.ts` |
| **SEC-12** | **Inaccurate Seed Response Descriptions** | **Low** | `StorageService.resetAndSeed()` did not distinguish between Supabase persistent mode and ephemeral demo mode. | Updated `resetAndSeed()` to return `{ mode, description, reset: boolean }`, explicitly reporting that ephemeral reset is disabled in production and managed via SQL migrations. | `src/lib/db/storage.ts`, `src/app/api/seed/route.ts` |

---

## 3. Detailed Files Changed and Added

| File Path | Nature of Change | Summary of Modifications |
|---|---|---|
| `src/lib/security/auth.ts` | **Added** | Centralized security utilities: `constantTimeCompare`, HMAC capability tokens (`generateFeedbackToken`, `verifyFeedbackToken`), and authorization helpers (`isAuthorizedAdmin`, `isAuthorizedReviewer`, `isAuthorizedWebhook`, `isAuthorizedEscalation`). |
| `src/lib/security/rateLimit.ts` | **Modified** | Hardened client IP extraction against header spoofing; added `resetRateLimits()` test helper. |
| `src/app/api/internal/intake-persist/route.ts` | **Modified** | Fails closed (500) on missing secret; constant-time 401 on bad secret; payload length validation (5-5000 chars); masked internal errors. |
| `src/app/api/seed/route.ts` | **Modified** | Rejects reviewer key with 403; requires `x-admin-key` in production; requires `x-demo-reset` in demo mode; truthful response formatting. |
| `src/app/api/feedback/route.ts` | **Modified** | Rate limiting (20 req/min); capability token validation; state constraint (`resolved` or `closed`); rating range (1-5); feedback length bounds. |
| `src/app/api/complaints/[id]/route.ts` | **Modified** | Returns computed `feedback_token` on GET; requires staff authorization on PATCH; validates status/priority enum values. |
| `src/app/api/escalate/route.ts` | **Modified** | Authenticates scheduled watchdog calls using `CRON_SECRET`, `ADMIN_API_KEY`, `REVIEWER_SECRET_KEY`, or webhook secret. Ignores client role headers. |
| `src/app/api/review/route.ts` | **Modified** | Rate limiting (30 req/min); timing-safe auth verified prior to payload validation; action alias normalization; complaint state validation. |
| `src/lib/db/storage.ts` | **Modified** | Concurrency conflict handling for `idempotency_key` (catches 23505); truthful `resetAndSeed()` return; fail-closed check when `DEMO_MODE=false`. |
| `src/lib/db/supabase.ts` | **Modified** | Dynamic `process.env` inspection in `isSupabaseConfigured()`, `getServerSupabase()`, and `getPublicSupabase()`. |
| `src/lib/triage/orchestrator.ts` | **Modified** | Throws clear configuration errors when `INTAKE_PROCESSING_MODE=n8n` and required URLs/secrets are missing (no silent fallback). |
| `supabase/migrations/20260102000000_tighten_rls_policies.sql` | **Modified** | Revoked broad authenticated access; scoped to `service_role` and staff app_metadata roles `('officer', 'admin', 'supervisor')`. |
| `n8n/workflows/complaint-intake.json` | **Modified** | Fail-closed secret check; input length bounds (5-5000 chars); authenticates to internal persistence route with shared secret. |
| `n8n/workflows/notifications.json` | **Modified** | Fail-closed secret check; truthful logging of simulated notifications when SMTP is unconfigured. |
| `n8n/workflows/resolution-feedback.json` | **Modified** | Forwards `x-webhook-secret` and `feedback_token` to `/api/feedback`. |
| `n8n/workflows/sla-escalation.json` | **Modified** | Authenticates outbound call using `CRON_SECRET` / `N8N_WEBHOOK_SECRET`. |
| `src/components/Navbar.tsx` | **Modified** | SLA watchdog trigger passes staff/demo headers. |
| `src/app/complaints/[id]/page.tsx` | **Modified** | Citizen feedback form submits `feedback_token`; status patch sends staff authorization header. |
| `.env.example` | **Modified** | Non-functional placeholders; detailed mode requirements; `CRON_SECRET` added. |
| `tests/civicpilot.test.ts` | **Modified** | Added Scenarios 24 through 32 covering all Phase 2-6 security boundaries, rate limiting, token generation, and concurrency. |

---

## 4. Verification Commands & Real Results

### 1. Automated Acceptance & Security Suite (`npm test`)

**Command**: `npm test`  
**Execution Environment**: Windows, Node.js v24.13.1, tsx v4.23.15  
**Result**: **96 PASSED | 0 FAILED** (Exited with code `0`)

```text
================================================================
🚀 RUNNING CIVICPILOT ACCEPTANCE & HARDENING TEST SUITE
================================================================

Scenario 1: Valid complaint creation
  ✓ [PASS] Intake reports success
  ✓ [PASS] Generated human-readable ticket number (CP-...)
  ✓ [PASS] Ticket successfully persisted in database

Scenario 2: Invalid input validation
  ✓ [PASS] Rejected description with fewer than 5 characters

Scenario 3: AI failure / invalid JSON fallback
  ✓ [PASS] Identified fallback execution
  ✓ [PASS] Fallback rule accurately categorized as electrical
  ✓ [PASS] Severity within valid 1-5 range

Scenario 4: Low-confidence complaint review routing
  ✓ [PASS] Flagged requires_human_review: true
  ✓ [PASS] Initial status set to pending_review

Scenario 5: Critical public safety handling
  ✓ [PASS] Elevated to maximum severity 5
  ✓ [PASS] Assigned CRITICAL priority

Scenario 6: Duplicate detection and linking
  ✓ [PASS] Detected duplicate report
  ✓ [PASS] Child ticket links to canonical duplicate_of
  ✓ [PASS] Returned canonical ticket reference

Scenario 7: Cross-location separation (no false merge)
  ✓ [PASS] Different location complaint NOT merged as duplicate
  ✓ [PASS] Created as independent canonical ticket

Scenario 8: Category to Department routing
  ✓ [PASS] Sanitation routed to Sanitation department
  ✓ [PASS] Water routed to Water Supply department

Scenario 9: Unknown category fallback queue
  ✓ [PASS] Unrecognized category routed to Ombudsman fallback
  ✓ [PASS] Unknown category requires human review

Scenario 10: Unauthorized reviewer rejection
  ✓ [PASS] Invalid authorization secret does not match configured secret

Scenario 11: Review approval audit event
  ✓ [PASS] Recorded review_action audit event
  ✓ [PASS] Event found in complaint history

Scenario 12: Overdue ticket escalation
  ✓ [PASS] SLA watchdog identified overdue tickets
  ✓ [PASS] Overdue ticket escalated to supervisor tier

Scenario 13: SLA watchdog idempotency
  ✓ [PASS] Immediate re-run did NOT duplicate escalation for same tier

Scenario 14: Notification delivery tracking
  ✓ [PASS] Simulated notification recorded with status: simulated
  ✓ [PASS] Simulated notification has delivered_at: null (never falsely marked delivered)
  ✓ [PASS] Simulated notification documents reason in failure_reason
  ✓ [PASS] Notification persisted in audit store

Scenario 15: Citizen feedback & verified closure
  ✓ [PASS] Found resolved ticket
  ✓ [PASS] Citizen satisfaction 5-star rating recorded
  ✓ [PASS] Ticket transitioned to CLOSED following verified feedback

Scenario 16: Negative intake failure handling
  ✓ [PASS] Empty description threw error instead of false success

Scenario 17: Idempotency duplicate prevention
  ✓ [PASS] Both requests returned exact same ticket ID
  ✓ [PASS] Identical ticket number without duplicate row

Scenario 18: Dashboard analytics metrics reflection
  ✓ [PASS] Total complaints count reflects database records
  ✓ [PASS] Resolution rate accurately computed
  ✓ [PASS] Category breakdown aggregated accurately
  ✓ [PASS] Department workload tracked accurately

Scenario 19: Storage mode explicit labeling
  ✓ [PASS] Demo mode correctly detected when running locally without Supabase
  ✓ [PASS] Demo mode is explicitly flagged as non-durable
  ✓ [PASS] Mode description contains explicit Non-durable warning

Scenario 20: Storage production mode error handling (No silent fallback)
[Storage Configuration Error] DEMO_MODE=false but Supabase credentials (NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY) are missing.
  ✓ [PASS] Storage throws explicit error without silent fallback when DEMO_MODE=false and credentials missing

Scenario 21: Priority score algorithm with crowd boost and safety multipliers
  ✓ [PASS] Crowd boost increases total priority score
  ✓ [PASS] Crowd boost clamped to max 1.00
  ✓ [PASS] Safety multiplier applies 1.35x factor
  ✓ [PASS] Severity 5 with safety flag assigned critical priority

Scenario 22: Deduplication heuristic validation
  ✓ [PASS] Detected matching complaint near college gate as duplicate
  ✓ [PASS] High confidence for matching description and location

Scenario 23: AI fallback safety preservation
  ✓ [PASS] Hazard complaint assigned maximum severity 5
  ✓ [PASS] immediate_hazard flag set
  ✓ [PASS] Structural collapse preserved at severity 5 without degradation

Scenario 24: Internal intake-persist endpoint security
[intake-persist] Server misconfiguration: Webhook shared secret is missing from environment.
  ✓ [PASS] Fails closed with 500 when N8N_WEBHOOK_SECRET is unset in environment
  ✓ [PASS] Rejects missing x-webhook-secret with 401
  ✓ [PASS] Rejects invalid x-webhook-secret with 401
  ✓ [PASS] Rejects description shorter than 5 chars with 400
  ✓ [PASS] Rejects oversized description (>5000 chars) with 400
  ✓ [PASS] Accepts valid intake-persist request with 201 Created
  ✓ [PASS] Persisted ticket has ID and success flag

Scenario 25: Seed/reset endpoint authorization boundaries
  ✓ [PASS] Demo mode reset without confirmation header returns 401
  ✓ [PASS] Reviewer secret attempting administrative reset is rejected with 403 Forbidden
  ✓ [PASS] Demo reset with confirmation header returns 200
  ✓ [PASS] Response truthfully identifies demo mode and reset: true
  ✓ [PASS] Production mode reset without admin key returns 401
  ✓ [PASS] Production reset with valid admin key returns 200
  ✓ [PASS] Production mode truthfully reports reset: false (schema managed via migrations)

Scenario 26: n8n intake processing mode fail-fast (no silent fallback)
  ✓ [PASS] Throws explicit configuration error when n8n mode is missing webhook URL (no silent fallback)

Scenario 27: Citizen feedback capability token & state machine validation
  ✓ [PASS] Valid capability token verified for matching ticket ID
  ✓ [PASS] Capability token rejected when presented for different ticket ID
  ✓ [PASS] Found open complaint for state transition test
  ✓ [PASS] Rejects feedback submission on non-resolved ticket with 400 Bad Request
  ✓ [PASS] Error accurately states feedback requires resolved or closed status
  ✓ [PASS] Found resolved complaint
  ✓ [PASS] Rejects feedback without capability token or staff key with 401 Unauthorized
  ✓ [PASS] Rejects forged capability token with 401
  ✓ [PASS] Accepts feedback with valid capability token with 200 OK
  ✓ [PASS] Ticket updated to status closed with 5-star rating
  ✓ [PASS] Reopen submission accepted with 200
  ✓ [PASS] Reopens ticket following persistent complaint feedback

Scenario 28: SLA watchdog & escalation endpoint authorization
  ✓ [PASS] Rejects unauthenticated escalation watchdog call with 401
  ✓ [PASS] Client-controlled spoofed role header rejected with 401
  ✓ [PASS] Valid cron secret executes SLA watchdog with 200 OK
  ✓ [PASS] Returns valid scan metrics

Scenario 29: Reviewer endpoint authorization & state transitions
  ✓ [PASS] Rejects reviewer action without secret with 401
  ✓ [PASS] Rejects invalid reviewer secret with 401
  ✓ [PASS] Rejects unrecognized review action with 400
  ✓ [PASS] Authorized reviewer action executes with 200 OK

Scenario 30: In-process rate limiter enforcement & client IP tracking
  ✓ [PASS] Rate limiter accurately blocks 6th request when maxRequests=5
  ✓ [PASS] Rate limiter reset restores allowed status

Scenario 31: Concurrent duplicate intake requests handling
  ✓ [PASS] Concurrent requests with identical idempotency key resolve to exact same ticket ID
  ✓ [PASS] Consistent ticket number across concurrent invocations

Scenario 32: Timing-safe secret comparison robustness
  ✓ [PASS] Matching secrets return true
  ✓ [PASS] Mismatched secrets return false
  ✓ [PASS] Different length secrets return false
  ✓ [PASS] Empty strings return false (defense against empty bypass)

================================================================
🏁 TEST RESULTS: 96 PASSED | 0 FAILED
================================================================
```

### 2. Static Analysis & Code Quality (`npm run lint`)

**Command**: `npm run lint`  
**Result**: Clean pass with **0 errors and 0 warnings** (Exited with code `0`).

### 3. Production Build Compilation (`npm run build`)

**Command**: `npm run build`  
**Result**: Clean Turbopack compilation across all 19 application and API routes (Exited with code `0`).

---

## 5. Live vs. Mocked Integration Status

| System Integration | Verification Method | Live vs Mocked Classification | Notes & Operational Constraints |
|---|---|---|---|
| **In-Memory Store (Demo Mode)** | Automated In-Process Suite (`npm test`) | **Live Local Engine** | 100% verified. Persists across requests in demo mode and resets on verified demo command. |
| **API Route Endpoints** | Direct Next.js Request Handlers (`new NextRequest`) | **Live Handler Execution** | Handlers executed with real payloads, headers, constant-time checks, and HMAC hashing. |
| **Supabase PostgreSQL** | Mock Credentials & SQL Script Inspection | **Code & Schema Verified; Live DB Unapplied** | Live Supabase project credentials were not provided in the environment. SQL migrations are syntax-verified and documented. |
| **Google Gemini AI** | Fallback Heuristics Unit Tested | **Mocked / Fallback Verified** | Generative API call was tested against deterministic civic safety fallback rules. Live API key required for live AI extraction. |
| **n8n Automation Engine** | Static JSON Validation & Schema Audit | **Export Validated; Engine Unconnected** | Workflow JSON files are valid and hardened with fail-closed authentication. Requires live n8n instance to trigger. |
| **Notifications (SMS/Email/Telegram)** | Simulated Dispatch Unit Tested | **Truthful Simulation Verified** | Verified that notifications record `status: 'simulated'` with `delivered_at: null` instead of falsely claiming delivery. |

---

## 6. Manual Steps Required for Production Deployment

### 1. Apply Supabase Database Migrations
Since live database credentials were not active during this audit, execute the following SQL scripts in your Supabase SQL Editor in order:
1. `supabase/migrations/20260101000000_civicpilot_schema.sql` (Creates core schema, tables, departments, indexes, and atomic ticket sequence RPC).
2. `supabase/migrations/20260102000000_tighten_rls_policies.sql` (Applies strict least-privilege RLS policies restricting ordinary authenticated users and reserving writes to `service_role`).

### 2. Configure Environment Secrets
Copy `.env.example` to `.env.local` and populate:
- `DEMO_MODE=false`
- `NEXT_PUBLIC_SUPABASE_URL=https://<your-project>.supabase.co`
- `SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>`
- `ADMIN_API_KEY=<strong-random-admin-secret>`
- `REVIEWER_SECRET_KEY=<strong-random-reviewer-secret>`
- `CRON_SECRET=<strong-random-cron-secret>`
- `N8N_WEBHOOK_SECRET=<strong-random-webhook-secret>`
- `GEMINI_API_KEY=<your-gemini-api-key>`

### 3. Deploy and Import n8n Workflows (If n8n Processing Mode is Selected)
If using `INTAKE_PROCESSING_MODE=n8n`:
1. Start n8n container (`docker compose up -d n8n`).
2. Import JSON workflows from `n8n/workflows/`:
   - `complaint-intake.json`
   - `human-review.json`
   - `notifications.json`
   - `resolution-feedback.json`
   - `sla-escalation.json`
3. Configure environment variables in n8n (`NEXT_PUBLIC_APP_URL`, `N8N_WEBHOOK_SECRET`, `REVIEWER_SECRET_KEY`, `GEMINI_API_KEY`).
4. Activate the workflows.

### 4. Setup Scheduled SLA Cron Watchdog
Configure a scheduled cron job (e.g. Vercel Cron, GitHub Action, or AWS EventBridge) to call:
```bash
curl -X POST https://your-civicpilot-domain.gov/api/escalate \
  -H "x-cron-secret: <CRON_SECRET>"
```
every 15 minutes.

---

## 7. Remaining Limitations and Residual Risks

1. **In-Memory Rate Limiting in Serverless Environments**:  
   The current rate limiter uses an in-process sliding-window map. On multi-instance serverless deployments (e.g., Vercel edge/lambdas without sticky routing), rate limiting state is not shared between distinct instances. For distributed multi-region deployments, configure Upstash Redis or Supabase-backed rate limiting.
2. **Citizen Identity in Anonymous Mode**:  
   Complaints submitted without Supabase Auth session rely on ticket-scoped HMAC capability tokens for feedback verification. If a citizen loses their ticket page link, they cannot retrieve their feedback token without staff assistance.
3. **Live External Delivery Dependencies**:  
   Telegram alerts and SMTP email dispatch depend on external third-party availability. The system is designed to gracefully record failed delivery attempts in the `notifications` table with detailed error messages without blocking complaint intake.
