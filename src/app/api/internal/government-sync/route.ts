import { NextRequest, NextResponse } from 'next/server';
import { StorageService } from '@/lib/db/storage';
import { isAuthorizedAdmin, isAuthorizedWebhook } from '@/lib/security/auth';
import { syncGovernmentTicket } from '@/lib/government/adapter';

export async function POST(req: NextRequest) {
  if (!isAuthorizedAdmin(req.headers.get('x-admin-key')) && !isAuthorizedWebhook(req.headers.get('x-webhook-secret')).authorized) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 }); }
  if (typeof body.complaint_id !== 'string') return NextResponse.json({ error: 'complaint_id is required.' }, { status: 400 });
  const ticket = await StorageService.getComplaintById(body.complaint_id);
  if (!ticket) return NextResponse.json({ error: 'Ticket not found.' }, { status: 404 });
  try {
    const result = await syncGovernmentTicket(ticket, body.operation === 'refresh' ? 'refresh' : 'submit');
    return NextResponse.json(result);
  } catch (error) {
    console.error('[Government sync]', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Government sync failed.' }, { status: 422 });
  }
}
