import { NextRequest, NextResponse } from 'next/server';
import { runSlaWatchdog } from '@/lib/triage/escalation';
import {
  isAuthorizedAdmin,
  isAuthorizedReviewer,
  isAuthorizedWebhook,
  constantTimeCompare,
} from '@/lib/security/auth';

export async function POST(req: NextRequest) {
  try {
    const cronSecret = process.env.CRON_SECRET;

    const adminHeader = req.headers.get('x-admin-key');
    const reviewerHeader = req.headers.get('x-reviewer-secret');
    const watchdogHeader = req.headers.get('x-watchdog-secret');
    const cronHeader = req.headers.get('x-cron-secret') || req.headers.get('authorization')?.replace('Bearer ', '');

    let authorized = false;

    if (cronSecret && cronHeader && constantTimeCompare(cronHeader, cronSecret)) {
      authorized = true;
    } else if (adminHeader && isAuthorizedAdmin(adminHeader)) {
      authorized = true;
    } else if (reviewerHeader && isAuthorizedReviewer(reviewerHeader)) {
      authorized = true;
    } else if (watchdogHeader && isAuthorizedWebhook(watchdogHeader).authorized) {
      authorized = true;
    }

    if (!authorized) {
      return NextResponse.json(
        {
          success: false,
          error: 'Unauthorized: Valid cron secret, admin key, or staff credentials required to trigger SLA watchdog.',
        },
        { status: 401 }
      );
    }

    const result = await runSlaWatchdog();
    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      ...result,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error executing SLA escalation scan';
    console.error('[escalate] Failure:', message);
    return NextResponse.json({ success: false, error: 'Internal error executing SLA watchdog.' }, { status: 500 });
  }
}
