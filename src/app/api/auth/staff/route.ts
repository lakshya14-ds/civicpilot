import { NextRequest, NextResponse } from 'next/server';
import { isAuthorizedReviewer, isAuthorizedAdmin } from '@/lib/security/auth';
import { checkRateLimit, getClientIp } from '@/lib/security/rateLimit';

export async function POST(req: NextRequest) {
  try {
    const clientIp = getClientIp(req.headers);
    const limit = checkRateLimit(`staff-login:${clientIp}`, {
      windowMs: 60 * 1000,
      maxRequests: 15,
    });

    if (!limit.allowed) {
      return NextResponse.json(
        { success: false, error: 'Too many login attempts. Please wait a moment before trying again.' },
        { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
      );
    }

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ success: false, error: 'Invalid JSON request payload' }, { status: 400 });
    }

    const secret = typeof body.secret === 'string' ? body.secret.trim() : '';
    const officerId = typeof body.officer_id === 'string' && body.officer_id.trim()
      ? body.officer_id.trim().slice(0, 50)
      : 'officer-1';

    if (!secret) {
      return NextResponse.json({ success: false, error: 'Staff authorization key is required.' }, { status: 400 });
    }

    const isValidReviewer = isAuthorizedReviewer(secret);
    const isValidAdmin = isAuthorizedAdmin(secret);

    if (!isValidReviewer && !isValidAdmin) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid municipal authorization passkey. Please check your credentials.',
        },
        { status: 401 }
      );
    }

    const role = isValidAdmin ? 'admin' : 'reviewer';

    return NextResponse.json({
      success: true,
      officer_id: officerId,
      role,
      message: 'Staff authentication successful.',
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Server error during staff authentication';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const secret = req.headers.get('x-reviewer-secret') || req.headers.get('x-admin-key');
  const isValidReviewer = isAuthorizedReviewer(secret);
  const isValidAdmin = isAuthorizedAdmin(secret);

  if (isValidReviewer || isValidAdmin) {
    return NextResponse.json({
      authenticated: true,
      role: isValidAdmin ? 'admin' : 'reviewer',
    });
  }

  return NextResponse.json({ authenticated: false }, { status: 401 });
}
