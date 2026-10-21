import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { POST as whatsappPost } from '../src/app/api/internal/whatsapp-intake/route';
import { StorageService } from '../src/lib/db/storage';
import { publicComplaint, publicEvent } from '../src/lib/security/public-view';
import { detectPilotLanguage } from '../src/lib/channels/whatsapp';
import { syncGovernmentTicket } from '../src/lib/government/adapter';
import { saveEvidence } from '../src/lib/media/evidence';
import { GET as complaintGet } from '../src/app/api/complaints/[id]/route';
import { isSupabaseConfigured } from '../src/lib/db/supabase';
import { generateTrackingToken } from '../src/lib/security/auth';

process.env.DEMO_MODE = 'true';
process.env.N8N_WEBHOOK_SECRET = 'channel-test-secret';
process.env.INTAKE_PROCESSING_MODE = 'in_app';
process.env.REVIEWER_SECRET_KEY = 'channel-staff-test-key';

let sequence = 0;
async function send(from: string, content: Record<string, unknown>) {
  sequence += 1;
  const req = new NextRequest('http://localhost:3000/api/internal/whatsapp-intake', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-webhook-secret': 'channel-test-secret' },
    body: JSON.stringify({ message: { id: `wamid.test-${sequence}`, from, ...content } }),
  });
  const response = await whatsappPost(req);
  assert.equal(response.status, 200);
  return response.json();
}

async function main() {
  const originalKeys = {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    publishable: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    secret: process.env.SUPABASE_SECRET_KEY,
    legacySecret: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
  try {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test';
    delete process.env.SUPABASE_SECRET_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    assert.equal(isSupabaseConfigured(), false, 'A public key alone cannot enable privileged storage.');
    process.env.SUPABASE_SECRET_KEY = 'sb_secret_test';
    assert.equal(isSupabaseConfigured(), true, 'A modern server secret enables privileged storage.');
  } finally {
    for (const [name, value] of Object.entries({
      NEXT_PUBLIC_SUPABASE_URL: originalKeys.url,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: originalKeys.publishable,
      SUPABASE_SECRET_KEY: originalKeys.secret,
      SUPABASE_SERVICE_ROLE_KEY: originalKeys.legacySecret,
    })) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
  await StorageService.resetAndSeed();
  assert.equal(detectPilotLanguage('सड़क खराब है'), 'hi');
  assert.equal(detectPilotLanguage('ರಸ್ತೆಯಲ್ಲಿ ಗುಂಡಿ ಇದೆ'), 'kn');
  assert.equal(detectPilotLanguage('ರಸ್ತೆಯಲ್ಲಿ ಗುಂಡಿ ಇದೆ', 'en'), 'kn');

  const kannadaSender = '919876543211';
  const kannadaFirst = await send(kannadaSender, { type: 'text', text: { body: 'ರಸ್ತೆಯಲ್ಲಿ ದೊಡ್ಡ ಗುಂಡಿ ಇದೆ' } });
  assert.match(kannadaFirst.text, /ಸ್ಥಳದ ಪಿನ್/);
  const kannadaSecond = await send(kannadaSender, { type: 'location', location: { latitude: 12.925, longitude: 77.594, name: 'Jayanagar', address: 'Bengaluru' } });
  assert.match(kannadaSecond.text, /ದೂರು/);
  const kannadaStatus = await send(kannadaSender, { type: 'text', text: { body: `STATUS ${kannadaSecond.ticket_number}` } });
  assert.match(kannadaStatus.text, /ಸ್ಥಿತಿಯಲ್ಲಿದೆ/);

  const sender = '919876543210';
  const first = await send(sender, { type: 'text', text: { body: 'Dangerous pothole near the old library.' } });
  assert.match(first.text, /location pin|landmark/i);
  const second = await send(sender, { type: 'location', location: { latitude: 12.9716, longitude: 77.5946, name: 'Old Library', address: 'Bengaluru pilot area' } });
  assert.match(second.ticket_number, /^CP-\d{4}-\d{5,}$/);

  const ticket = await StorageService.getComplaintById(second.ticket_number);
  assert.ok(ticket);
  assert.equal(ticket.source_channel, 'whatsapp');
  assert.equal(ticket.citizen_contact, '+919876543210');
  const publicTicket = publicComplaint(ticket);
  assert.equal(publicTicket.citizen_contact, null);
  assert.equal(publicTicket.latitude, null);
  const image = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==', 'base64'));
  const imageReference = await saveEvidence(image);
  await StorageService.updateComplaint(ticket.id, { image_url: imageReference });
  const publicResponse = await complaintGet(new NextRequest(`http://localhost:3000/api/complaints/${ticket.id}`), { params: Promise.resolve({ id: ticket.id }) });
  assert.equal(publicResponse.status, 401);
  const ownerResponse = await complaintGet(new NextRequest(`http://localhost:3000/api/complaints/${ticket.id}`, { headers: { 'x-tracking-token': generateTrackingToken(ticket.id) } }), { params: Promise.resolve({ id: ticket.id }) });
  const ownerData = await ownerResponse.json();
  assert.equal(ownerResponse.status, 200);
  assert.equal(ownerData.complaint.citizen_contact, null);
  assert.match(ownerData.media_urls.report, /^data:image\/png;base64,/);
  assert.equal(ownerData.feedback_token, undefined);
  const staffResponse = await complaintGet(new NextRequest(`http://localhost:3000/api/complaints/${ticket.id}`, { headers: { 'x-reviewer-secret': 'channel-staff-test-key' } }), { params: Promise.resolve({ id: ticket.id }) });
  const staffData = await staffResponse.json();
  assert.match(staffData.media_urls.report, /^data:image\/png;base64,/);
  const publicTimeline = publicEvent({ id: 'event', complaint_id: ticket.id, event_type: 'feedback', actor: 'Citizen', description: 'private remarks', metadata: { reopened: true }, created_at: new Date().toISOString() });
  assert.ok(!publicTimeline.description.includes('private remarks'));

  const unauthorized = await send('919999999999', { type: 'text', text: { body: `STATUS ${ticket.ticket_number}` } });
  assert.match(unauthorized.text, /not linked/i);
  const status = await send(sender, { type: 'text', text: { body: `STATUS ${ticket.ticket_number}` } });
  assert.match(status.text, /currently/i);

  await StorageService.updateComplaint(ticket.id, { status: 'resolved' });
  const closed = await send(sender, { type: 'text', text: { body: `FIXED ${ticket.ticket_number}` } });
  assert.match(closed.text, /closed/i);
  assert.equal((await StorageService.getComplaintById(ticket.id))?.status, 'closed');
  const reopened = await send(sender, { type: 'text', text: { body: `REOPEN ${ticket.ticket_number}` } });
  assert.match(reopened.text, /reopened/i);
  assert.equal((await StorageService.getComplaintById(ticket.id))?.status, 'open');

  process.env.GOVERNMENT_ADAPTER = 'mock';
  const mockSync = await syncGovernmentTicket((await StorageService.getComplaintById(ticket.id))!);
  assert.equal(mockSync.mode, 'simulated');
  assert.equal(mockSync.official_reference, null);
  assert.equal((await StorageService.getComplaintById(ticket.id))?.government_status, 'simulated');

  console.log('WhatsApp clarification, authorization, feedback, public redaction, and simulated agency sync passed.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
