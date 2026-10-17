# CivicPilot — n8n Automation Workflows

This folder contains importable JSON workflow definitions for n8n, enabling autonomous civic operations orchestration.

## Included Workflows

1. **`complaint-intake.json` (Workflow A: Intake and Triage)**
   - **Path**: `POST /webhook/civicpilot-intake`
   - **Functions**: Sanitizes citizen input & masks PII → Calls Gemini AI model for structured extraction → Applies deterministic fallback if unavailable → Executes 2-stage duplicate detection → Calculates priority score & department assignment → Dispatches initial notifications.

2. **`human-review.json` (Workflow B: Human Review Action)**
   - **Path**: `POST /webhook/civicpilot-review`
   - **Functions**: Validates officer authorization against allowlist / secret → Applies reviewer overrides (category, department, priority) → Transitions status from `pending_review` to `open` (or `rejected`) → Emits audit log event.

3. **`sla-escalation.json` (Workflow C: SLA Monitoring and Escalation)**
   - **Trigger**: Every 15 minutes (or manual `POST /webhook/civicpilot-sla`)
   - **Functions**: Identifies tickets breaching SLA deadlines without active resolution → Promotes escalation tier → Sends urgent alert to designated departmental supervisor.

4. **`notifications.json` (Workflow D: Multi-Channel Notifications Dispatch)**
   - **Path**: `POST /webhook/civicpilot-notify`
   - **Functions**: Routes alerts across Email, Telegram, and In-app notifications with delivery status tracking.

5. **`resolution-feedback.json` (Workflow E: Resolution and Feedback Loop)**
   - **Path**: `POST /webhook/civicpilot-feedback`
   - **Functions**: Ingests citizen satisfaction rating (1–5) and verification notes → Automatically re-opens ticket if citizen indicates problem persists, or locks closure if confirmed.

6. **`whatsapp-citizen-intake.json` (Workflow F: Citizen Photo Intake)**
   - **Trigger**: Incoming WhatsApp message through the official Meta WhatsApp Trigger node.
   - **Functions**: Passes text/photo/location to the secured CivicPilot intake service; that service stores a 24-hour clarification draft, downloads private photo evidence, creates a ticket once description and location are known, and returns a localized reply. n8n sends the reply through the WhatsApp Business Cloud node.
   - **Setup**: Assign WhatsApp OAuth credentials to the trigger and WhatsApp API credentials to the send node after import. Set `CIVICPILOT_APP_URL`, `N8N_WEBHOOK_SECRET`, and `WHATSAPP_PHONE_NUMBER_ID` in the n8n environment. Set `WHATSAPP_ACCESS_TOKEN` and `META_GRAPH_API_VERSION` in the Next.js environment for photo download. Both n8n and Next.js must be reachable over HTTPS for a live Meta number.

7. **`government-sync.json` (Workflow G: Approved Agency Adapter)**
   - **Path**: `POST /webhook/civicpilot-government-sync` with `x-webhook-secret` and `{ "complaint_id": "...", "operation": "submit" | "refresh" }`.
   - **Functions**: Validates the workflow call and invokes the app's government adapter. Default `GOVERNMENT_ADAPTER=mock` records a simulated handoff without inventing an official reference. An authorized Open311 partner requires `GOVERNMENT_INTEGRATION_ENABLED=true` and partner endpoint, jurisdiction, API key, and service-code mapping. A partner status never automatically closes a CivicPilot ticket; the citizen feedback loop remains separate.

---

## Running n8n Locally via Docker

To start n8n:

```bash
docker compose up -d n8n
```

Docker Compose reads the n8n values from your shell or a project `.env` file. The Next.js `.env.local` file is separate. For a local Docker run on Windows, `CIVICPILOT_APP_URL` defaults to `http://host.docker.internal:3000`; a deployed workflow needs the reachable HTTPS app URL. Keep secrets out of version control.

Access the n8n editor at: `http://localhost:5678`

### Windows development without Docker

For local workflow development with Node 20.19–24, install n8n into the ignored project runtime and start it with the shared secret from `.env.local`:

```powershell
npm install --prefix .n8n-runtime n8n@2.43.7 --no-save --no-audit --no-fund
powershell -ExecutionPolicy Bypass -File scripts\start-n8n-local.ps1
```

The script binds n8n to `127.0.0.1:5678`, stores its database and encryption key under ignored `.n8n-local`, and points workflows at the local Next.js app. This npm setup is for development only. The seven workflow definitions can be imported with:

```powershell
$env:N8N_USER_FOLDER=Join-Path (Get-Location).Path '.n8n-local'
node .n8n-runtime\node_modules\n8n\bin\n8n import:workflow --separate --input=n8n/workflows
```

Create the owner account in the editor, inspect each imported workflow, add any required credentials, then publish the workflows you are ready to run. The local intake has passed synthetic end-to-end tests, including a live Gemini 3.6 Flash classification of a Kannada report, so `.env.local` uses `INTAKE_PROCESSING_MODE=n8n` and the local production webhook. A hosted deployment must repeat that check with its own HTTPS app and n8n URL.

### Importing Workflows

1. Open `http://localhost:5678` in your browser.
2. In the left navigation, click **Workflows** → **Add workflow** (or click the `...` menu in the upper right) → **Import from File**.
3. Select any `.json` file from `./n8n/workflows/`.
4. Configure the required credentials and **Publish** each workflow after testing it.

### Environment Configuration in `.env.local`

To connect CivicPilot with your live n8n instance, set:

```env
N8N_WEBHOOK_INTAKE_URL=http://localhost:5678/webhook/civicpilot-intake
N8N_WEBHOOK_REVIEW_URL=http://localhost:5678/webhook/civicpilot-review
N8N_WEBHOOK_SLA_URL=http://localhost:5678/webhook/civicpilot-sla
N8N_WEBHOOK_NOTIFY_URL=http://localhost:5678/webhook/civicpilot-notify
N8N_WEBHOOK_SECRET=<generate-a-long-random-secret>
INTAKE_PROCESSING_MODE=n8n
```
