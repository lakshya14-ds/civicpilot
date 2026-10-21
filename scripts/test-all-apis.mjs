import fs from 'node:fs';

const envContent = fs.readFileSync('.env.local', 'utf8');
const env = {};
for (const line of envContent.split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, '');
}

const baseUrl = 'http://localhost:3000';
const n8nUrl = 'http://localhost:5678';
const results = [];

async function test(name, fn) {
  const start = Date.now();
  try {
    await fn();
    results.push({ name, status: 'PASS', durationMs: Date.now() - start });
    console.log(`[PASS] ${name} (${Date.now() - start}ms)`);
  } catch (err) {
    results.push({ name, status: 'FAIL', error: err.message, durationMs: Date.now() - start });
    console.error(`[FAIL] ${name} (${Date.now() - start}ms):`, err.message);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed');
}

console.log('=== RUNNING COMPLETE API & SERVICE INTEGRITY AUDIT ===\n');

// 1. Supabase & Departments API
await test('GET /api/departments (Supabase departments fetch)', async () => {
  const res = await fetch(`${baseUrl}/api/departments`);
  assert(res.status === 200, `Expected 200, got ${res.status}`);
  const data = await res.json();
  assert(Array.isArray(data) && data.length >= 4, `Expected at least 4 departments, got ${data?.length}`);
  assert(data.some(d => d.slug === 'roads'), 'Missing roads department');
});

// 2. Complaints API
await test('GET /api/complaints (Public complaint docket)', async () => {
  const res = await fetch(`${baseUrl}/api/complaints`);
  assert(res.status === 200, `Expected 200, got ${res.status}`);
  const data = await res.json();
  assert(Array.isArray(data.data), 'Expected data array');
  assert(data.total >= 1, 'Expected at least 1 complaint');
  assert(data.data[0].ticket_number, 'Missing ticket_number');
});

// 3. Analytics API
await test('GET /api/analytics (Municipal analytics metrics)', async () => {
  const res = await fetch(`${baseUrl}/api/analytics`);
  assert(res.status === 200, `Expected 200, got ${res.status}`);
  const data = await res.json();
  assert(data.summary && typeof data.summary.total === 'number', 'Missing summary.total');
  assert(data.departmentWorkload, 'Missing departmentWorkload');
});

// 4. Audit Log API
await test('GET /api/audit (Event audit trail)', async () => {
  const res = await fetch(`${baseUrl}/api/audit?limit=10`);
  assert(res.status === 200, `Expected 200, got ${res.status}`);
  const data = await res.json();
  assert(Array.isArray(data.events), 'Expected events array');
});

// 5. Media Upload API
let uploadedEvidenceRef = null;
await test('POST /api/media (Private civic evidence upload)', async () => {
  const formData = new FormData();
  // Valid 1x1 transparent PNG file
  const pngBytes = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
    0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00,
    0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
    0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49,
    0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82
  ]);
  const blob = new Blob([pngBytes], { type: 'image/png' });
  formData.append('file', blob, 'test-evidence.png');

  const res = await fetch(`${baseUrl}/api/media`, {
    method: 'POST',
    body: formData,
  });
  assert(res.status === 201, `Expected 201, got ${res.status}`);
  const data = await res.json();
  assert(data.reference && data.reference.startsWith('evidence://'), `Invalid reference: ${data.reference}`);
  uploadedEvidenceRef = data.reference;
});

// 6. n8n Connectivity & Intake Webhook
let createdTicket = null;
let feedbackToken = null;
let reviewTargetId = null;
await test('POST n8n Webhook /webhook/civicpilot-intake (n8n + Gemini 3.8 Flash + Supabase)', async () => {
  const res = await fetch(`${n8nUrl}/webhook/civicpilot-intake`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-webhook-secret': env.N8N_WEBHOOK_SECRET,
    },
    body: JSON.stringify({
      description: 'Major high-voltage spark and severed wire on Koramangala 80ft road near 4th block signal.',
      location_text: 'Koramangala 80ft Road, Bengaluru',
      language: 'en',
      source_channel: 'api_integrity_test',
      image_url: uploadedEvidenceRef,
    }),
  });
  assert(res.status === 201, `Expected 201, got ${res.status}`);
  const data = await res.json();
  assert(data.success === true, 'Response success was not true');
  assert(data.ticket && data.ticket.id, 'Missing ticket id');
  assert(data.ai_extraction, 'Missing ai_extraction');
  assert(data.ai_extraction.is_fallback === false, 'AI extraction should not be fallback');
  assert(data.ai_extraction.model_name === 'gemini-3.8-flash', `Expected gemini-3.8-flash, got ${data.ai_extraction.model_name}`);
  assert(data.ai_extraction.category === 'electrical', `Expected category electrical, got ${data.ai_extraction.category}`);
  createdTicket = data.ticket;
});

// 7. Full App Intake Endpoint (POST /api/intake)
await test('POST /api/intake (Next.js Intake routing to n8n)', async () => {
  const res = await fetch(`${baseUrl}/api/intake`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      description: 'Severe sewage overflow spreading onto public walkway near Indiranagar Metro entrance.',
      location_text: 'Indiranagar Metro Station, Bengaluru',
      citizen_name: 'Audit Prober',
      language: 'en',
    }),
  });
  assert(res.status === 201, `Expected 201, got ${res.status}`);
  const data = await res.json();
  assert(data.success === true, 'Intake failed');
  assert(data.ticket && data.ticket.ticket_number, 'Missing ticket number');
  assert(data.feedback_token, 'Missing feedback token');
  feedbackToken = data.feedback_token;
});

// 8. Officer Review Authorization & Action
await test('POST /api/review (Security boundaries & Officer triage)', async () => {
  // Query for a ticket in pending_review
  const pendingRes = await fetch(`${baseUrl}/api/complaints?requires_human_review=true`);
  const pendingData = await pendingRes.json();
  reviewTargetId = pendingData.data?.[0]?.id || createdTicket.id;

  // Test unauthorized
  const unauthRes = await fetch(`${baseUrl}/api/review`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      complaint_id: reviewTargetId,
      action: 'approved',
    }),
  });
  assert(unauthRes.status === 401, `Expected 401 Unauthorized, got ${unauthRes.status}`);

  // Test authorized
  const authRes = await fetch(`${baseUrl}/api/review`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-reviewer-secret': env.REVIEWER_SECRET_KEY,
    },
    body: JSON.stringify({
      complaint_id: reviewTargetId,
      action: 'approved',
      reviewer_id: 'officer-test-audit',
      reviewer_notes: 'Reviewed and confirmed for urgent priority line repair.',
    }),
  });
  assert(authRes.status === 200, `Expected 200 OK, got ${authRes.status}`);
  const data = await authRes.json();
  assert(data.success === true, 'Review approval was not success');
});

// 8b. Feedback Loop API (POST /api/feedback)
await test('POST /api/feedback (Feedback capability token & state checks)', async () => {
  // Test invalid token
  const invalidRes = await fetch(`${baseUrl}/api/feedback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      complaint_id: reviewTargetId,
      rating: 5,
      feedback_token: 'invalid_dummy_token',
    }),
  });
  assert(invalidRes.status === 401, `Expected 401 Unauthorized for bad token, got ${invalidRes.status}`);

  // Test missing rating
  const badPayload = await fetch(`${baseUrl}/api/feedback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      complaint_id: reviewTargetId,
    }),
  });
  assert(badPayload.status === 400, `Expected 400 Bad Request, got ${badPayload.status}`);
});

// 9. SLA Watchdog Cron (POST /api/escalate)
await test('POST /api/escalate (SLA Watchdog scan with cron secret)', async () => {
  // Test unauthorized
  const unauth = await fetch(`${baseUrl}/api/escalate`, { method: 'POST' });
  assert(unauth.status === 401, `Expected 401, got ${unauth.status}`);

  // Test authorized with CRON_SECRET
  const auth = await fetch(`${baseUrl}/api/escalate`, {
    method: 'POST',
    headers: { 'x-cron-secret': env.CRON_SECRET },
  });
  assert(auth.status === 200, `Expected 200, got ${auth.status}`);
  const data = await auth.json();
  assert(data.success === true, 'Escalate scan failed');
  assert(typeof data.checked_count === 'number', 'Expected checked_count');
});

// 10. Seed Security Boundaries (POST /api/seed)
await test('POST /api/seed (Security boundaries for administrative reset)', async () => {
  // Test unauthenticated
  const unauth = await fetch(`${baseUrl}/api/seed`, { method: 'POST' });
  assert(unauth.status === 401, `Expected 401, got ${unauth.status}`);

  // Test reviewer key rejected
  const reviewerAttempt = await fetch(`${baseUrl}/api/seed`, {
    method: 'POST',
    headers: { 'x-reviewer-secret': env.REVIEWER_SECRET_KEY },
  });
  assert(reviewerAttempt.status === 403, `Expected 403 Forbidden, got ${reviewerAttempt.status}`);

  // Test valid admin key
  const adminRes = await fetch(`${baseUrl}/api/seed`, {
    method: 'POST',
    headers: { 'x-admin-key': env.ADMIN_API_KEY },
  });
  assert(adminRes.status === 200, `Expected 200 OK, got ${adminRes.status}`);
  const data = await adminRes.json();
  assert(data.success === true, 'Admin seed request failed');
});

console.log('\n======================================================');
const passed = results.filter(r => r.status === 'PASS').length;
const failed = results.filter(r => r.status === 'FAIL').length;
console.log(`TOTAL TESTS: ${results.length} | PASSED: ${passed} | FAILED: ${failed}`);
console.log('======================================================');

if (failed > 0) process.exit(1);
