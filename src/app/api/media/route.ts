import { NextRequest, NextResponse } from 'next/server';
import { EvidenceError, saveEvidence } from '@/lib/media/evidence';
import { isAuthorizedWebhook } from '@/lib/security/auth';
import { checkRateLimit, getClientIp } from '@/lib/security/rateLimit';

export async function POST(req: NextRequest) {
  const webhook = isAuthorizedWebhook(req.headers.get('x-webhook-secret'));
  if (req.headers.has('x-webhook-secret') && !webhook.authorized) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }
  if (!webhook.authorized) {
    const limit = checkRateLimit(`media:${getClientIp(req.headers)}`, { windowMs: 60_000, maxRequests: 10 });
    if (!limit.allowed) return NextResponse.json({ error: 'Too many uploads.' }, { status: 429 });
  }

  try {
    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) return NextResponse.json({ error: 'A photo file is required.' }, { status: 400 });
    if (file.size > 4 * 1024 * 1024) return NextResponse.json({ error: 'Photo must be 4 MB or less.' }, { status: 413 });
    const reference = await saveEvidence(new Uint8Array(await file.arrayBuffer()));
    return NextResponse.json({ reference }, { status: 201 });
  } catch (error) {
    console.error('[POST /api/media] Photo upload error:', error);
    const status = error instanceof EvidenceError ? error.status : 400;
    const message = error instanceof EvidenceError ? error.message : 'Invalid photo upload.';
    return NextResponse.json({ error: message }, { status });
  }
}
