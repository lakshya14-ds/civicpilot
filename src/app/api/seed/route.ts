import { NextRequest, NextResponse } from 'next/server';
import { StorageService } from '@/lib/db/storage';
import { isAuthorizedAdmin } from '@/lib/security/auth';

export async function POST(req: NextRequest) {
  try {
    const isDemo = process.env.DEMO_MODE === 'true';
    const adminKey = process.env.ADMIN_API_KEY;

    // Fail closed in production if administrative credentials are not configured
    if (!isDemo && !adminKey) {
      console.error('[Security] ADMIN_API_KEY is not configured in production environment.');
      return NextResponse.json(
        {
          success: false,
          error: 'Server configuration error: Administrative credentials are not configured for production resets.',
        },
        { status: 500 }
      );
    }

    const adminHeader = req.headers.get('x-admin-key');
    const demoHeader = req.headers.get('x-demo-reset');

    // Reject ordinary reviewer keys: reviewer credentials cannot perform administrative resets
    if (req.headers.has('x-reviewer-secret')) {
      return NextResponse.json(
        {
          success: false,
          error: 'Forbidden: Reviewer credentials cannot authorize administrative reset or seed operations. Dedicated ADMIN_API_KEY required.',
        },
        { status: 403 }
      );
    }

    let authorized = false;

    if (adminHeader && isAuthorizedAdmin(adminHeader)) {
      authorized = true;
    } else if (isDemo && demoHeader === 'civicpilot-demo-confirm') {
      authorized = true;
    }

    if (!authorized) {
      return NextResponse.json(
        {
          success: false,
          error: isDemo
            ? 'Unauthorized: Valid x-admin-key header or x-demo-reset: civicpilot-demo-confirm header is required.'
            : 'Unauthorized: Valid x-admin-key header matching ADMIN_API_KEY is required for administrative resets.',
        },
        { status: 401 }
      );
    }

    const result = await StorageService.resetAndSeed();

    return NextResponse.json({
      success: true,
      message: result.description,
      mode: result.mode,
      reset: result.reset,
      did_reset: result.reset,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error reseeding database';
    console.error('[seed] Failure:', message);
    return NextResponse.json({ success: false, error: 'Internal error processing seed request.' }, { status: 500 });
  }
}
