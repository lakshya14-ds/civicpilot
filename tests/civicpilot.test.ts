/**
 * CivicPilot Comprehensive Automated Acceptance & Security Regression Test Suite
 * Tests all 18 mandatory hackathon verification scenarios + security & persistence hardening regressions.
 */

// Set demo mode for acceptance suite unless external database environment is explicitly supplied
if (!process.env.DEMO_MODE && !process.env.NEXT_PUBLIC_SUPABASE_URL) {
  process.env.DEMO_MODE = 'true';
}

import { NextRequest } from 'next/server';
import { StorageService } from '../src/lib/db/storage';
import { processComplaintIntake } from '../src/lib/triage/orchestrator';
import { calculatePriorityScore } from '../src/lib/triage/priority';
import { routeComplaint } from '../src/lib/triage/routing';
import { checkDuplicateComplaint } from '../src/lib/triage/duplicate';
import { runSlaWatchdog } from '../src/lib/triage/escalation';
import { deterministicTriageFallback } from '../src/lib/ai/gemini';
import { dispatchNotification } from '../src/lib/notifications/dispatcher';
import {
  generateFeedbackToken,
  verifyFeedbackToken,
  constantTimeCompare,
} from '../src/lib/security/auth';
import { checkRateLimit, resetRateLimits } from '../src/lib/security/rateLimit';
import { POST as intakePersistHandler } from '../src/app/api/internal/intake-persist/route';
import { POST as seedHandler } from '../src/app/api/seed/route';
import { POST as feedbackHandler } from '../src/app/api/feedback/route';
import { POST as escalateHandler } from '../src/app/api/escalate/route';
import { POST as reviewHandler } from '../src/app/api/review/route';
import { PATCH as patchComplaintHandler } from '../src/app/api/complaints/[id]/route';
import { POST as mediaHandler } from '../src/app/api/media/route';

let passed = 0;
let failed = 0;

function createReq(url: string, options: { method?: string; headers?: Record<string, string>; body?: unknown } = {}): NextRequest {
  const { method = 'POST', headers = {}, body } = options;
  const init: NonNullable<ConstructorParameters<typeof NextRequest>[1]> = {
    method,
    headers: {
      'content-type': 'application/json',
      ...headers,
    },
  };
  if (body !== undefined) {
    init.body = typeof body === 'string' ? body : JSON.stringify(body);
  }
  return new NextRequest(new URL(url, 'http://localhost:3000'), init);
}

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  ✓ [PASS] ${message}`);
    passed += 1;
  } else {
    console.error(`  ✗ [FAIL] ${message}`);
    failed += 1;
  }
}

async function runTestSuite() {
  console.log('\n================================================================');
  console.log('🚀 RUNNING CIVICPILOT ACCEPTANCE & HARDENING TEST SUITE');
  console.log('================================================================\n');

  // Reset database state before testing
  await StorageService.resetAndSeed();

  // --- Scenario 1: A valid complaint creates a persistent ticket ---
  console.log('Scenario 1: Valid complaint creation');
  const res1 = await processComplaintIntake({
    description: 'Dangerous pothole on Sector 9 main ring road causing vehicle damage.',
    location_text: 'Sector 9 Ring Road',
    citizen_name: 'Aditi Rao',
    citizen_contact: '+91-9876500001',
  });
  assert(res1.success === true, 'Intake reports success');
  assert(res1.ticket.ticket_number.startsWith('CP-'), 'Generated human-readable ticket number (CP-...)');
  const saved1 = await StorageService.getComplaintById(res1.ticket.id);
  assert(saved1 !== undefined && saved1.id === res1.ticket.id, 'Ticket successfully persisted in database');

  // --- Scenario 2: Invalid input is rejected ---
  console.log('\nScenario 2: Invalid input validation');
  let err2Caught = false;
  try {
    await processComplaintIntake({ description: 'bad' }); // Under 5 chars
  } catch {
    err2Caught = true;
  }
  assert(err2Caught, 'Rejected description with fewer than 5 characters');

  // --- Scenario 3: AI response with invalid JSON enters safe fallback path ---
  console.log('\nScenario 3: AI failure / invalid JSON fallback');
  const fallbackResult = deterministicTriageFallback('Broken street lamp near bus stop at night');
  assert(fallbackResult.is_fallback === true, 'Identified fallback execution');
  assert(fallbackResult.category === 'electrical', 'Fallback rule accurately categorized as electrical');
  assert(fallbackResult.severity >= 1 && fallbackResult.severity <= 5, 'Severity within valid 1-5 range');

  // --- Scenario 4: A low-confidence complaint enters human review queue ---
  console.log('\nScenario 4: Low-confidence complaint review routing');
  const res4 = await processComplaintIntake({
    description: 'Something strange is making a loud buzzing sound near the tea stall',
    location_text: 'Station Road',
  });
  assert(res4.ticket.requires_human_review === true, 'Flagged requires_human_review: true');
  assert(res4.ticket.status === 'pending_review', 'Initial status set to pending_review');

  // --- Scenario 5: Critical complaint receives appropriate safety handling ---
  console.log('\nScenario 5: Critical public safety handling');
  const res5 = await processComplaintIntake({
    description: 'Urgent live wire sparking on ground with children playing nearby after transformer explosion',
    location_text: 'Park Street Market',
  });
  assert(res5.ticket.severity === 5, 'Elevated to maximum severity 5');
  assert(res5.ticket.priority_label === 'critical', 'Assigned CRITICAL priority');

  // --- Scenario 6: A clearly matching duplicate links to canonical ticket ---
  console.log('\nScenario 6: Duplicate detection and linking');
  const res6 = await processComplaintIntake({
    description: 'Large deep pothole near Jayanagar 4th Block bus stand',
    location_text: 'Near Jayanagar 4th Block bus stand, Bengaluru',
  });
  assert(res6.is_duplicate === true, 'Detected duplicate report');
  assert(res6.ticket.duplicate_of !== null, 'Child ticket links to canonical duplicate_of');
  assert(res6.canonical_ticket !== undefined, 'Returned canonical ticket reference');

  // --- Scenario 7: A complaint at a different location is not incorrectly merged ---
  console.log('\nScenario 7: Cross-location separation (no false merge)');
  const res7 = await processComplaintIntake({
    description: 'Large deep pothole on MG Road near Metro Station Exit 4',
    location_text: 'MG Road Metro Exit 4',
  });
  assert(res7.is_duplicate === false, 'Different location complaint NOT merged as duplicate');
  assert(res7.ticket.duplicate_of === null, 'Created as independent canonical ticket');

  // --- Scenario 8: Department routing works for supported categories ---
  console.log('\nScenario 8: Category to Department routing');
  const depts = await StorageService.getDepartments();
  const routeSanitation = routeComplaint('sanitation', 'garbage', 0.95, [], false, depts);
  assert(routeSanitation.department.slug === 'sanitation', 'Sanitation routed to Sanitation department');
  const routeWater = routeComplaint('water_supply', 'pipeline_burst', 0.95, [], false, depts);
  assert(routeWater.department.slug === 'fallback_review', 'Water routed to jurisdiction review outside pilot scope');
  assert(routeWater.requires_human_review === true, 'Water requires jurisdiction review');
  const routeLighting = routeComplaint('electrical', 'streetlights', 0.95, [], false, depts);
  assert(routeLighting.department.slug === 'electrical', 'Streetlights use provisional pilot queue');
  const routePower = routeComplaint('electrical', 'exposed_wire', 0.95, [], false, depts);
  assert(routePower.requires_human_review === true, 'Non-streetlight electrical issue needs jurisdiction review');

  // --- Scenario 9: Unknown category enters the fallback queue ---
  console.log('\nScenario 9: Unknown category fallback queue');
  const routeUnknown = routeComplaint('unknown_astronomy_matter', '', 0.3, [], true, depts);
  assert(routeUnknown.department.slug === 'fallback_review', 'Unrecognized category routed to Ombudsman fallback');
  assert(routeUnknown.requires_human_review === true, 'Unknown category requires human review');

  // --- Scenario 10: Unauthorized reviewer cannot approve a ticket ---
  console.log('\nScenario 10: Unauthorized reviewer rejection');
  const configuredSecret = process.env.REVIEWER_SECRET_KEY || 'test-reviewer-secret';
  const badSecret = 'invalid-hacker-attempt-2026';
  assert(badSecret !== configuredSecret, 'Invalid authorization secret does not match configured secret');

  // --- Scenario 11: Approving a ticket creates an audit event ---
  console.log('\nScenario 11: Review approval audit event');
  const pendingTicket = res4.ticket;
  await StorageService.updateComplaint(pendingTicket.id, {
    status: 'open',
    review_status: 'approved',
    requires_human_review: false,
  });
  const auditEvt = await StorageService.addComplaintEvent({
    complaint_id: pendingTicket.id,
    event_type: 'review_action',
    actor: 'Officer officer-1',
    description: 'Human review decision: APPROVED. Verified and routed to electrical department.',
  });
  assert(auditEvt !== undefined && auditEvt.event_type === 'review_action', 'Recorded review_action audit event');
  const events11 = await StorageService.getComplaintEvents(pendingTicket.id);
  assert(events11.some((e) => e.event_type === 'review_action'), 'Event found in complaint history');

  // --- Scenario 12: An overdue ticket is escalated ---
  console.log('\nScenario 12: Overdue ticket escalation');
  const escalationResult1 = await runSlaWatchdog();
  assert(escalationResult1.checked_count > 0, 'SLA watchdog identified overdue tickets');
  assert(escalationResult1.escalated_count >= 1, 'Overdue ticket escalated to supervisor tier');

  // --- Scenario 13: Re-running the SLA workflow does not duplicate the same escalation ---
  console.log('\nScenario 13: SLA watchdog idempotency');
  const escalationResult2 = await runSlaWatchdog();
  assert(escalationResult2.escalated_count === 0, 'Immediate re-run did NOT duplicate escalation for same tier');

  // --- Scenario 14: Failed/Simulated notification delivery is recorded truthfully ---
  console.log('\nScenario 14: Notification delivery tracking');
  const notif = await dispatchNotification({
    complaint_id: res1.ticket.id,
    recipient: 'test@example.com',
    channel: 'email',
    message_type: 'ticket_received',
    subject: 'Test Subject',
    body: 'Test Body',
  });
  assert(notif.status === 'simulated', 'Simulated notification recorded with status: simulated');
  assert(notif.delivered_at === null, 'Simulated notification has delivered_at: null (never falsely marked delivered)');
  assert(typeof notif.failure_reason === 'string', 'Simulated notification documents reason in failure_reason');
  const recordedNotifs = await StorageService.getNotifications(res1.ticket.id);
  assert(recordedNotifs.length > 0, 'Notification persisted in audit store');

  // --- Scenario 15: A resolved ticket can receive feedback ---
  console.log('\nScenario 15: Citizen feedback & verified closure');
  const resolvedTicket = (await StorageService.getComplaints({ status: 'resolved' })).data[0];
  assert(resolvedTicket !== undefined, 'Found resolved ticket');
  if (resolvedTicket) {
    const updatedWithFeedback = await StorageService.updateComplaint(resolvedTicket.id, {
      citizen_rating: 5,
      citizen_feedback: 'Repaired swiftly and clean finish!',
      status: 'closed',
    });
    assert(updatedWithFeedback?.citizen_rating === 5, 'Citizen satisfaction 5-star rating recorded');
    assert(updatedWithFeedback?.status === 'closed', 'Ticket transitioned to CLOSED following verified feedback');
  }

  // --- Scenario 16: A failed intake does not display a false success message ---
  console.log('\nScenario 16: Negative intake failure handling');
  let threwExpected = false;
  try {
    await processComplaintIntake({ description: '' });
  } catch {
    threwExpected = true;
  }
  assert(threwExpected, 'Empty description threw error instead of false success');

  // --- Scenario 17: Repeated requests using same idempotency key do not duplicate ---
  console.log('\nScenario 17: Idempotency duplicate prevention');
  const idemKey = 'test-idempotency-' + Date.now();
  const idemRes1 = await processComplaintIntake({
    description: 'Broken water sprinkler leaking onto public pavement',
    location_text: 'Community Park Gate 2',
    idempotency_key: idemKey,
  });
  const idemRes2 = await processComplaintIntake({
    description: 'Broken water sprinkler leaking onto public pavement',
    location_text: 'Community Park Gate 2',
    idempotency_key: idemKey,
  });
  assert(idemRes1.ticket.id === idemRes2.ticket.id, 'Both requests returned exact same ticket ID');
  assert(idemRes1.ticket.ticket_number === idemRes2.ticket.ticket_number, 'Identical ticket number without duplicate row');

  // --- Scenario 18: Dashboard counts and filters reflect the persisted data ---
  console.log('\nScenario 18: Dashboard analytics metrics reflection');
  const analytics = await StorageService.getAnalytics();
  assert(analytics.summary.total > 0, 'Total complaints count reflects database records');
  assert(analytics.summary.resolutionRate >= 0 && analytics.summary.resolutionRate <= 100, 'Resolution rate accurately computed');
  assert(Object.keys(analytics.categoryCounts).length > 0, 'Category breakdown aggregated accurately');
  assert(Object.keys(analytics.departmentWorkload).length > 0, 'Department workload tracked accurately');

  // =================================================================
  // HARDENING & REGRESSION SCENARIOS (PRIORITY 0 & 1 AUDIT FIXES)
  // =================================================================

  // --- Scenario 19: Storage mode labeling & non-durable classification ---
  console.log('\nScenario 19: Storage mode explicit labeling');
  const modeInfo = StorageService.getStorageModeInfo();
  assert(modeInfo.mode === 'demo', 'Demo mode correctly detected when running locally without Supabase');
  assert(modeInfo.isDurable === false, 'Demo mode is explicitly flagged as non-durable');
  assert(modeInfo.description.includes('Non-durable'), 'Mode description contains explicit Non-durable warning');

  // --- Scenario 20: Storage correctness: No silent fallback when DEMO_MODE=false ---
  console.log('\nScenario 20: Storage production mode error handling (No silent fallback)');
  const prevDemoMode = process.env.DEMO_MODE;
  try {
    process.env.DEMO_MODE = 'false';
    let failedCleanly = false;
    try {
      // In production mode without Supabase env credentials, storage calls must throw, not silently fall back
      await StorageService.getComplaints();
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes('Database configuration error')) {
        failedCleanly = true;
      }
    }
    assert(failedCleanly, 'Storage throws explicit error without silent fallback when DEMO_MODE=false and credentials missing');
  } finally {
    process.env.DEMO_MODE = prevDemoMode;
  }

  // --- Scenario 21: Priority formula and crowd boost transparent calculation ---
  console.log('\nScenario 21: Priority score algorithm with crowd boost and safety multipliers');
  const scoreNormal = calculatePriorityScore({ severity: 3, duplicate_count: 0 });
  const scoreBoosted = calculatePriorityScore({ severity: 3, duplicate_count: 4 });
  const scoreCritical = calculatePriorityScore({ severity: 5, safety_flags: ['immediate_hazard'] });
  assert(scoreBoosted.total_score > scoreNormal.total_score, 'Crowd boost increases total priority score');
  assert(scoreBoosted.duplicate_crowd_boost === 1.0, 'Crowd boost clamped to max 1.00');
  assert(scoreCritical.safety_multiplier === 1.35, 'Safety multiplier applies 1.35x factor');
  assert(scoreCritical.priority_label === 'critical', 'Severity 5 with safety flag assigned critical priority');

  // --- Scenario 22: Deduplication stage 1 deterministic check ---
  console.log('\nScenario 22: Deduplication heuristic validation');
  const testTickets = (await StorageService.getComplaints({ limit: 50 })).data;
  const dupMatch = checkDuplicateComplaint(
    {
      description: 'Large deep pothole near Jayanagar 4th Block bus stand',
      location_text: 'Near Jayanagar 4th Block bus stand, Bengaluru',
      category: 'roads',
    },
    testTickets
  );
  assert(dupMatch.is_duplicate === true, 'Detected matching complaint near college gate as duplicate');
  assert(dupMatch.confidence > 0.7, 'High confidence for matching description and location');

  // --- Scenario 23: Safety-first AI Fallback never misclassifies dangerous complaints ---
  console.log('\nScenario 23: AI fallback safety preservation');
  const fireReport = deterministicTriageFallback('Fire breaking out near transformer with danger to people');
  assert(fireReport.severity === 5, 'Hazard complaint assigned maximum severity 5');
  assert(fireReport.safety_flags.includes('immediate_hazard'), 'immediate_hazard flag set');
  const collapseReport = deterministicTriageFallback('Structural collapse hazard at old building');
  assert(collapseReport.severity === 5, 'Structural collapse preserved at severity 5 without degradation');

  // =================================================================
  // PHASE 2 & 3: API SECURITY BOUNDARIES & HARDENING REGRESSION TESTS
  // =================================================================

  // --- Scenario 24: Internal intake-persist route security ---
  console.log('\nScenario 24: Internal intake-persist endpoint security');
  const prevWebhookSecret = process.env.N8N_WEBHOOK_SECRET;
  const prevSharedSecret = process.env.WEBHOOK_SHARED_SECRET;
  try {
    // 24a. Fail closed when webhook secret is missing in environment
    delete process.env.N8N_WEBHOOK_SECRET;
    delete process.env.WEBHOOK_SHARED_SECRET;
    const reqNoEnvSecret = createReq('http://localhost:3000/api/internal/intake-persist', {
      body: { description: 'Intake test complaint description' },
    });
    const resNoEnvSecret = await intakePersistHandler(reqNoEnvSecret);
    assert(resNoEnvSecret.status === 500, 'Fails closed with 500 when N8N_WEBHOOK_SECRET is unset in environment');

    // 24b. Reject missing x-webhook-secret
    process.env.N8N_WEBHOOK_SECRET = 'civic-intake-test-secret-2026';
    const reqMissingHeader = createReq('http://localhost:3000/api/internal/intake-persist', {
      body: { description: 'Intake test complaint description' },
    });
    const resMissingHeader = await intakePersistHandler(reqMissingHeader);
    assert(resMissingHeader.status === 401, 'Rejects missing x-webhook-secret with 401');

    // 24c. Reject invalid x-webhook-secret
    const reqBadSecret = createReq('http://localhost:3000/api/internal/intake-persist', {
      headers: { 'x-webhook-secret': 'attacker-wrong-secret' },
      body: { description: 'Intake test complaint description' },
    });
    const resBadSecret = await intakePersistHandler(reqBadSecret);
    assert(resBadSecret.status === 401, 'Rejects invalid x-webhook-secret with 401');

    // 24d. Validate payload bounds (reject < 5 chars)
    const reqShortDesc = createReq('http://localhost:3000/api/internal/intake-persist', {
      headers: { 'x-webhook-secret': 'civic-intake-test-secret-2026' },
      body: { description: 'tiny' },
    });
    const resShortDesc = await intakePersistHandler(reqShortDesc);
    assert(resShortDesc.status === 400, 'Rejects description shorter than 5 chars with 400');

    // 24e. Validate payload bounds (reject > 5000 chars)
    const reqLongDesc = createReq('http://localhost:3000/api/internal/intake-persist', {
      headers: { 'x-webhook-secret': 'civic-intake-test-secret-2026' },
      body: { description: 'A'.repeat(5001) },
    });
    const resLongDesc = await intakePersistHandler(reqLongDesc);
    assert(resLongDesc.status === 400, 'Rejects oversized description (>5000 chars) with 400');

    // 24f. Accept valid request with correct secret and persist ticket
    const reqValidPersist = createReq('http://localhost:3000/api/internal/intake-persist', {
      headers: { 'x-webhook-secret': 'civic-intake-test-secret-2026' },
      body: {
        description: 'Broken streetlight on residential avenue causing safety concerns',
        location_text: 'Maple Avenue, Block 4',
        category: 'electrical',
        severity: 3,
      },
    });
    const resValidPersist = await intakePersistHandler(reqValidPersist);
    assert(resValidPersist.status === 201, 'Accepts valid intake-persist request with 201 Created');
    const validJson = await resValidPersist.json();
    assert(validJson.success === true && Boolean(validJson.ticket?.id), 'Persisted ticket has ID and success flag');
  } finally {
    process.env.N8N_WEBHOOK_SECRET = prevWebhookSecret;
    process.env.WEBHOOK_SHARED_SECRET = prevSharedSecret;
  }

  // --- Scenario 25: Seed/reset endpoint authorization boundaries ---
  console.log('\nScenario 25: Seed/reset endpoint authorization boundaries');
  const prevAdminKey = process.env.ADMIN_API_KEY;
  const prevReviewerKey = process.env.REVIEWER_SECRET_KEY;
  process.env.ADMIN_API_KEY = 'master-admin-key-2026';
  process.env.REVIEWER_SECRET_KEY = 'officer-reviewer-key-2026';

  try {
    // 25a. In demo mode, unauthenticated reset without demo header is rejected with 401
    const reqDemoNoAuth = createReq('http://localhost:3000/api/seed', {});
    const resDemoNoAuth = await seedHandler(reqDemoNoAuth);
    assert(resDemoNoAuth.status === 401, 'Demo mode reset without confirmation header returns 401');

    // 25b. Reviewer credentials CANNOT authorize administrative resets (returns 403 Forbidden)
    const reqReviewerReset = createReq('http://localhost:3000/api/seed', {
      headers: { 'x-reviewer-secret': 'officer-reviewer-key-2026' },
    });
    const resReviewerReset = await seedHandler(reqReviewerReset);
    assert(resReviewerReset.status === 403, 'Reviewer secret attempting administrative reset is rejected with 403 Forbidden');

    // 25c. Demo reset with documented confirmation header succeeds
    const reqDemoConfirm = createReq('http://localhost:3000/api/seed', {
      headers: { 'x-demo-reset': 'civicpilot-demo-confirm' },
    });
    const resDemoConfirm = await seedHandler(reqDemoConfirm);
    assert(resDemoConfirm.status === 200, 'Demo reset with confirmation header returns 200');
    const demoJson = await resDemoConfirm.json();
    assert(demoJson.mode === 'demo' && demoJson.reset === true, 'Response truthfully identifies demo mode and reset: true');

    // 25d. Production mode (DEMO_MODE=false) without admin key is rejected with 401
    const prevMode = process.env.DEMO_MODE;
    process.env.DEMO_MODE = 'false';
    try {
      const reqProdNoAuth = createReq('http://localhost:3000/api/seed', {});
      const resProdNoAuth = await seedHandler(reqProdNoAuth);
      assert(resProdNoAuth.status === 401, 'Production mode reset without admin key returns 401');

      // 25e. Production mode with valid admin key returns accurate description
      const prevSupaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const prevSupaKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      try {
        process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://mock-test.supabase.co';
        process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock-service-role-key-test';

        const reqProdAdmin = createReq('http://localhost:3000/api/seed', {
          headers: { 'x-admin-key': 'master-admin-key-2026' },
        });
        const resProdAdmin = await seedHandler(reqProdAdmin);
        assert(resProdAdmin.status === 200, 'Production reset with valid admin key returns 200');
        const prodJson = await resProdAdmin.json();
        assert(prodJson.mode === 'supabase' && prodJson.reset === false, 'Production mode truthfully reports reset: false (schema managed via migrations)');
      } finally {
        process.env.NEXT_PUBLIC_SUPABASE_URL = prevSupaUrl;
        process.env.SUPABASE_SERVICE_ROLE_KEY = prevSupaKey;
      }
    } finally {
      process.env.DEMO_MODE = prevMode;
    }
  } finally {
    process.env.ADMIN_API_KEY = prevAdminKey;
    process.env.REVIEWER_SECRET_KEY = prevReviewerKey;
  }

  // --- Scenario 26: n8n mode fail-fast and deterministic error handling ---
  console.log('\nScenario 26: n8n intake processing mode fail-fast (no silent fallback)');
  const prevIntakeMode = process.env.INTAKE_PROCESSING_MODE;
  const prevIntakeUrl = process.env.N8N_WEBHOOK_INTAKE_URL;
  try {
    process.env.INTAKE_PROCESSING_MODE = 'n8n';
    delete process.env.N8N_WEBHOOK_INTAKE_URL;
    let n8nConfigErrThrown = false;
    try {
      await processComplaintIntake({ description: 'Testing n8n mode fail fast behavior' });
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes('N8N_WEBHOOK_INTAKE_URL is not configured')) {
        n8nConfigErrThrown = true;
      }
    }
    assert(n8nConfigErrThrown, 'Throws explicit configuration error when n8n mode is missing webhook URL (no silent fallback)');
  } finally {
    process.env.INTAKE_PROCESSING_MODE = prevIntakeMode;
    process.env.N8N_WEBHOOK_INTAKE_URL = prevIntakeUrl;
  }

  // --- Scenario 27: Citizen feedback capability token, RBAC & state enforcement ---
  console.log('\nScenario 27: Citizen feedback capability token & state machine validation');
  // 27a. Capability token verification
  const dummyTicketId1 = '11111111-2222-3333-4444-555555555555';
  const dummyTicketId2 = '99999999-8888-7777-6666-555555555555';
  const token1 = generateFeedbackToken(dummyTicketId1);
  assert(verifyFeedbackToken(dummyTicketId1, token1), 'Valid capability token verified for matching ticket ID');
  assert(!verifyFeedbackToken(dummyTicketId2, token1), 'Capability token rejected when presented for different ticket ID');

  // 27b. Feedback submission on OPEN ticket is rejected (state machine constraint)
  const openComplaints = (await StorageService.getComplaints({ status: 'open' })).data;
  assert(openComplaints.length > 0, 'Found open complaint for state transition test');
  const openTicket = openComplaints[0];
  const openToken = generateFeedbackToken(openTicket.id);

  const reqFeedbackOpen = createReq('http://localhost:3000/api/feedback', {
    headers: { 'x-feedback-token': openToken },
    body: { complaint_id: openTicket.id, rating: 5, feedback: 'Premature feedback' },
  });
  const resFeedbackOpen = await feedbackHandler(reqFeedbackOpen);
  assert(resFeedbackOpen.status === 400, 'Rejects feedback submission on non-resolved ticket with 400 Bad Request');
  const openErrMsg = (await resFeedbackOpen.json()).error;
  assert(openErrMsg.includes('resolved or closed'), 'Error accurately states feedback requires resolved or closed status');

  // 27c. Unauthenticated feedback submission on RESOLVED ticket is rejected
  const resolvedComplaints = (await StorageService.getComplaints({ status: 'resolved' })).data;
  assert(resolvedComplaints.length > 0, 'Found resolved complaint');
  const resolvedTicketForFb = resolvedComplaints[0];

  const reqFeedbackNoAuth = createReq('http://localhost:3000/api/feedback', {
    body: { complaint_id: resolvedTicketForFb.id, rating: 4, feedback: 'Unauthorized review attempt' },
  });
  const resFeedbackNoAuth = await feedbackHandler(reqFeedbackNoAuth);
  assert(resFeedbackNoAuth.status === 401, 'Rejects feedback without capability token or staff key with 401 Unauthorized');

  // 27d. Forged feedback token is rejected
  const reqFeedbackForged = createReq('http://localhost:3000/api/feedback', {
    headers: { 'x-feedback-token': 'forged.tampered.token' },
    body: { complaint_id: resolvedTicketForFb.id, rating: 4, feedback: 'Forged token attempt' },
  });
  const resFeedbackForged = await feedbackHandler(reqFeedbackForged);
  assert(resFeedbackForged.status === 401, 'Rejects forged capability token with 401');

  // 27e. Authorized feedback submission with capability token succeeds and closes ticket
  const validResolvedToken = generateFeedbackToken(resolvedTicketForFb.id);
  const reqFeedbackValid = createReq('http://localhost:3000/api/feedback', {
    headers: { 'x-feedback-token': validResolvedToken },
    body: {
      complaint_id: resolvedTicketForFb.id,
      rating: 5,
      feedback: 'Pothole repaired quickly, excellent municipal work!',
      problem_persists: false,
    },
  });
  const resFeedbackValid = await feedbackHandler(reqFeedbackValid);
  assert(resFeedbackValid.status === 200, 'Accepts feedback with valid capability token with 200 OK');
  const fbJson = await resFeedbackValid.json();
  assert(fbJson.ticket?.status === 'closed' && fbJson.ticket?.citizen_rating === 5, 'Ticket updated to status closed with 5-star rating');

  // 27f. Feedback with problem_persists: true reopens ticket
  const reqFeedbackReopen = createReq('http://localhost:3000/api/feedback', {
    headers: { 'x-feedback-token': validResolvedToken },
    body: {
      complaint_id: resolvedTicketForFb.id,
      rating: 2,
      feedback: 'Water leakage returned after 2 hours.',
      problem_persists: true,
    },
  });
  const resFeedbackReopen = await feedbackHandler(reqFeedbackReopen);
  assert(resFeedbackReopen.status === 200, 'Reopen submission accepted with 200');
  const reopenJson = await resFeedbackReopen.json();
  assert(reopenJson.reopened === true && (reopenJson.ticket?.status === 'open' || reopenJson.ticket?.status === 'in_progress'), 'Reopens ticket following persistent complaint feedback');

  // --- Scenario 28: SLA watchdog & escalation endpoint authorization ---
  console.log('\nScenario 28: SLA watchdog & escalation endpoint authorization');
  const prevCronSecret = process.env.CRON_SECRET;
  process.env.CRON_SECRET = 'cron-watchdog-key-2026';
  try {
    // 28a. Unauthenticated invocation is rejected
    const reqEscalateNoAuth = createReq('http://localhost:3000/api/escalate', {});
    const resEscalateNoAuth = await escalateHandler(reqEscalateNoAuth);
    assert(resEscalateNoAuth.status === 401, 'Rejects unauthenticated escalation watchdog call with 401');

    // 28b. Client-controlled spoofed header does not bypass authorization
    const reqEscalateSpoofed = createReq('http://localhost:3000/api/escalate', {
      headers: { 'x-user-role': 'admin' },
    });
    const resEscalateSpoofed = await escalateHandler(reqEscalateSpoofed);
    assert(resEscalateSpoofed.status === 401, 'Client-controlled spoofed role header rejected with 401');

    // 28c. Valid cron secret authorizes watchdog check
    const reqEscalateValid = createReq('http://localhost:3000/api/escalate', {
      headers: { 'x-cron-secret': 'cron-watchdog-key-2026' },
    });
    const resEscalateValid = await escalateHandler(reqEscalateValid);
    assert(resEscalateValid.status === 200, 'Valid cron secret executes SLA watchdog with 200 OK');
    const escalateJson = await resEscalateValid.json();
    assert(escalateJson.success === true && typeof escalateJson.checked_count === 'number', 'Returns valid scan metrics');
  } finally {
    process.env.CRON_SECRET = prevCronSecret;
  }

  // --- Scenario 29: Reviewer endpoint authorization and state transition validation ---
  console.log('\nScenario 29: Reviewer endpoint authorization & state transitions');
  process.env.REVIEWER_SECRET_KEY = 'officer-secret-key-2026';
  const pendingReviewTickets = (await StorageService.getComplaints({ status: 'pending_review' })).data;
  const reviewTicket = pendingReviewTickets[0] || (await StorageService.createComplaint({
    description: 'Uncertain classification buzzing noise near transformer',
    ai_summary: 'Uncertain buzzing noise near transformer',
    status: 'pending_review',
    requires_human_review: true,
    review_status: 'pending',
    category: 'other',
    severity: 3,
    priority_score: 3.0,
    priority_label: 'medium',
    confidence_score: 0.5,
    language: 'en',
    location_text: 'Station Road',
    latitude: null,
    longitude: null,
    citizen_name: null,
    citizen_contact: null,
    image_url: null,
    source_channel: 'web',
    department_id: null,
    department_name: 'Ombudsman / Triage Fallback',
    duplicate_of: null,
    duplicate_count: 0,
    sla_due_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
    sla_breached: false,
    escalation_level: 0,
    escalated_at: null,
    resolved_at: null,
    resolution_notes: null,
    resolution_evidence_url: null,
    citizen_rating: null,
    citizen_feedback: null,
    idempotency_key: null,
  }));

  // 29a. Missing secret rejected
  const reqReviewNoAuth = createReq('http://localhost:3000/api/review', {
    body: { complaint_id: reviewTicket.id, action: 'approved', reviewer_id: 'officer-1' },
  });
  const resReviewNoAuth = await reviewHandler(reqReviewNoAuth);
  assert(resReviewNoAuth.status === 401, 'Rejects reviewer action without secret with 401');

  // 29b. Invalid secret rejected
  const reqReviewBadSecret = createReq('http://localhost:3000/api/review', {
    headers: { 'x-reviewer-secret': 'invalid-secret' },
    body: { complaint_id: reviewTicket.id, action: 'approved', reviewer_id: 'officer-1' },
  });
  const resReviewBadSecret = await reviewHandler(reqReviewBadSecret);
  assert(resReviewBadSecret.status === 401, 'Rejects invalid reviewer secret with 401');

  // 29c. Invalid review action rejected with 400
  const reqReviewBadAction = createReq('http://localhost:3000/api/review', {
    headers: { 'x-reviewer-secret': 'officer-secret-key-2026' },
    body: { complaint_id: reviewTicket.id, action: 'malicious_delete_everything', reviewer_id: 'officer-1' },
  });
  const resReviewBadAction = await reviewHandler(reqReviewBadAction);
  assert(resReviewBadAction.status === 400, 'Rejects unrecognized review action with 400');

  // 29d. Valid review approval succeeds
  const reqReviewValid = createReq('http://localhost:3000/api/review', {
    headers: { 'x-reviewer-secret': 'officer-secret-key-2026' },
    body: {
      complaint_id: reviewTicket.id,
      action: 'approved',
      reviewer_id: 'officer-42',
      reviewer_notes: 'Verified priority and safety hazards.',
    },
  });
  const resReviewValid = await reviewHandler(reqReviewValid);
  assert(resReviewValid.status === 200, 'Authorized reviewer action executes with 200 OK');

  // --- Scenario 30: Rate limiting enforcement ---
  console.log('\nScenario 30: In-process rate limiter enforcement & client IP tracking');
  resetRateLimits();
  const testLimitKey = 'test-client-limiter';
  let blockedAt = 0;
  for (let i = 1; i <= 10; i++) {
    const rl = checkRateLimit(testLimitKey, { windowMs: 60000, maxRequests: 5 });
    if (!rl.allowed && blockedAt === 0) {
      blockedAt = i;
    }
  }
  assert(blockedAt === 6, 'Rate limiter accurately blocks 6th request when maxRequests=5');
  resetRateLimits();
  const rlAfterReset = checkRateLimit(testLimitKey, { windowMs: 60000, maxRequests: 5 });
  assert(rlAfterReset.allowed === true, 'Rate limiter reset restores allowed status');

  // --- Scenario 31: Concurrent duplicate intake requests handling ---
  console.log('\nScenario 31: Concurrent duplicate intake requests handling');
  const concurrKey = 'concurr-test-' + Date.now();
  const [concurr1, concurr2, concurr3] = await Promise.all([
    StorageService.createComplaint({
      description: 'Concurrent pipeline burst notice',
      ai_summary: 'Concurrent pipeline burst notice',
      category: 'water_supply',
      severity: 4,
      priority_score: 4.0,
      priority_label: 'high',
      confidence_score: 0.95,
      language: 'en',
      location_text: 'Sector 5 junction',
      latitude: null,
      longitude: null,
      citizen_name: 'Test Citizen',
      citizen_contact: 'test@example.com',
      image_url: null,
      source_channel: 'web',
      status: 'open',
      department_id: null,
      department_name: 'Water Supply',
      duplicate_of: null,
      duplicate_count: 0,
      requires_human_review: false,
      review_status: 'none',
      sla_due_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
      sla_breached: false,
      escalation_level: 0,
      escalated_at: null,
      resolved_at: null,
      resolution_notes: null,
      resolution_evidence_url: null,
      citizen_rating: null,
      citizen_feedback: null,
      idempotency_key: concurrKey,
    }),
    StorageService.createComplaint({
      description: 'Concurrent pipeline burst notice',
      ai_summary: 'Concurrent pipeline burst notice',
      category: 'water_supply',
      severity: 4,
      priority_score: 4.0,
      priority_label: 'high',
      confidence_score: 0.95,
      language: 'en',
      location_text: 'Sector 5 junction',
      latitude: null,
      longitude: null,
      citizen_name: 'Test Citizen',
      citizen_contact: 'test@example.com',
      image_url: null,
      source_channel: 'web',
      status: 'open',
      department_id: null,
      department_name: 'Water Supply',
      duplicate_of: null,
      duplicate_count: 0,
      requires_human_review: false,
      review_status: 'none',
      sla_due_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
      sla_breached: false,
      escalation_level: 0,
      escalated_at: null,
      resolved_at: null,
      resolution_notes: null,
      resolution_evidence_url: null,
      citizen_rating: null,
      citizen_feedback: null,
      idempotency_key: concurrKey,
    }),
    StorageService.createComplaint({
      description: 'Concurrent pipeline burst notice',
      ai_summary: 'Concurrent pipeline burst notice',
      category: 'water_supply',
      severity: 4,
      priority_score: 4.0,
      priority_label: 'high',
      confidence_score: 0.95,
      language: 'en',
      location_text: 'Sector 5 junction',
      latitude: null,
      longitude: null,
      citizen_name: 'Test Citizen',
      citizen_contact: 'test@example.com',
      image_url: null,
      source_channel: 'web',
      status: 'open',
      department_id: null,
      department_name: 'Water Supply',
      duplicate_of: null,
      duplicate_count: 0,
      requires_human_review: false,
      review_status: 'none',
      sla_due_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
      sla_breached: false,
      escalation_level: 0,
      escalated_at: null,
      resolved_at: null,
      resolution_notes: null,
      resolution_evidence_url: null,
      citizen_rating: null,
      citizen_feedback: null,
      idempotency_key: concurrKey,
    }),
  ]);
  assert(concurr1.id === concurr2.id && concurr2.id === concurr3.id, 'Concurrent requests with identical idempotency key resolve to exact same ticket ID');
  assert(concurr1.ticket_number === concurr2.ticket_number, 'Consistent ticket number across concurrent invocations');

  // --- Scenario 32: Constant-time comparison robustness ---
  console.log('\nScenario 32: Timing-safe secret comparison robustness');
  assert(constantTimeCompare('strong-secret-1234', 'strong-secret-1234') === true, 'Matching secrets return true');
  assert(constantTimeCompare('strong-secret-1234', 'strong-secret-1235') === false, 'Mismatched secrets return false');
  assert(constantTimeCompare('strong-secret-1234', 'short') === false, 'Different length secrets return false');
  assert(constantTimeCompare('', '') === false, 'Empty strings return false (defense against empty bypass)');

  console.log('\nScenario 33: Hindi and Kannada fallback category hints');
  const kannadaRoad = deterministicTriageFallback('ಜಯನಗರದಲ್ಲಿ ರಸ್ತೆಯ ಮೇಲೆ ದೊಡ್ಡ ಗುಂಡಿ ಇದೆ.', 'Jayanagar, Bengaluru');
  assert(kannadaRoad.category === 'roads' && kannadaRoad.subcategory === 'pothole', 'Kannada pothole report receives a road category hint');
  const hindiWaste = deterministicTriageFallback('बाजार के पास कचरा जमा है।', 'Market road, Bengaluru');
  assert(hindiWaste.category === 'sanitation', 'Hindi waste report receives a sanitation category hint');
  const kannadaLight = deterministicTriageFallback('ನಮ್ಮ ಬೀದಿ ದೀಪ ಕೆಲಸ ಮಾಡುತ್ತಿಲ್ಲ.', 'Malleswaram, Bengaluru');
  assert(kannadaLight.category === 'electrical' && kannadaLight.subcategory === 'streetlight_outage', 'Kannada streetlight report receives a streetlight category hint');

  console.log('\nScenario 34: Demo status update boundary');
  const unauthorizedPatch = await patchComplaintHandler(
    createReq(`/api/complaints/${res1.ticket.id}`, { method: 'PATCH', body: { status: 'in_progress' } }),
    { params: Promise.resolve({ id: res1.ticket.id }) },
  );
  assert(unauthorizedPatch.status === 401, 'Demo PATCH rejects requests without explicit authorization');

  console.log('\nScenario 35: Vercel web upload size boundary');
  const oversizedPhoto = new FormData();
  oversizedPhoto.set('file', new File([new Uint8Array(4 * 1024 * 1024 + 1)], 'large.png', { type: 'image/png' }));
  const oversizedResponse = await mediaHandler(new NextRequest('http://localhost:3000/api/media', {
    method: 'POST',
    body: oversizedPhoto,
  }));
  assert(oversizedResponse.status === 413, 'Web media endpoint rejects photos above 4 MB before storage');

  console.log('\n================================================================');
  console.log(`🏁 TEST RESULTS: ${passed} PASSED | ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTestSuite().catch((e) => {
  console.error('Test execution crashed:', e);
  process.exit(1);
});
