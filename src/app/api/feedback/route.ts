import { NextRequest, NextResponse } from 'next/server';
import { StorageService } from '@/lib/db/storage';
import {
  verifyFeedbackToken,
  isAuthorizedReviewer,
  isAuthorizedAdmin,
  isAuthorizedWebhook,
} from '@/lib/security/auth';
import { checkRateLimit, getClientIp } from '@/lib/security/rateLimit';
import { applyCitizenFeedback } from '@/lib/triage/feedback';

export async function POST(req: NextRequest) {
  try {
    // 1. Rate limiting on feedback endpoint (max 20 requests/minute per client IP)
    const clientIp = getClientIp(req.headers);
    const rateLimit = checkRateLimit(`feedback:${clientIp}`, {
      windowMs: 60 * 1000,
      maxRequests: 20,
    });

    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Rate limit exceeded for feedback submissions. Please try again shortly.' },
        { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } }
      );
    }

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Malformed JSON payload' }, { status: 400 });
    }

    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid request payload: must be a JSON object' }, { status: 400 });
    }

    const { complaint_id, rating, feedback, problem_persists, feedback_token } = body;

    // 2. Validate Complaint ID & Input Types
    if (!complaint_id || typeof complaint_id !== 'string') {
      return NextResponse.json({ error: 'complaint_id is required and must be a string UUID' }, { status: 400 });
    }

    if (typeof rating !== 'number' || isNaN(rating) || !Number.isInteger(rating) || rating < 1 || rating > 5) {
      return NextResponse.json(
        { error: 'rating is required and must be an integer between 1 and 5.' },
        { status: 400 }
      );
    }

    if (feedback !== undefined && feedback !== null && typeof feedback !== 'string') {
      return NextResponse.json({ error: 'feedback must be a string' }, { status: 400 });
    }

    const trimmedFeedback = typeof feedback === 'string' ? feedback.trim().slice(0, 2000) : null;
    const persists = Boolean(problem_persists);

    // 3. Verify Complaint Existence
    const complaint = await StorageService.getComplaintById(complaint_id);
    if (!complaint) {
      return NextResponse.json({ error: 'Complaint not found.' }, { status: 404 });
    }

    // 4. Strict Authorization Check (Ticket Capability Token, Staff Secret, or Webhook Secret)
    const providedToken =
      req.headers.get('x-feedback-token') ||
      (typeof feedback_token === 'string' ? feedback_token : null);

    const reviewerHeader = req.headers.get('x-reviewer-secret');
    const adminHeader = req.headers.get('x-admin-key');
    const webhookHeader = req.headers.get('x-webhook-secret');
    const demoHeader = req.headers.get('x-demo-feedback');

    const isDemo = process.env.DEMO_MODE === 'true';

    const isAuthorized =
      (providedToken && verifyFeedbackToken(complaint.id, providedToken)) ||
      (reviewerHeader && isAuthorizedReviewer(reviewerHeader)) ||
      (adminHeader && isAuthorizedAdmin(adminHeader)) ||
      (webhookHeader && isAuthorizedWebhook(webhookHeader)) ||
      (isDemo && demoHeader === 'civicpilot-demo-confirm');

    if (!isAuthorized) {
      return NextResponse.json(
        {
          error:
            'Unauthorized: Valid ticket feedback capability token (x-feedback-token) or staff authorization is required.',
        },
        { status: 401 }
      );
    }

    // 5. Allowed State Transition Validation
    // Resolution feedback can only be submitted for tickets that are resolved or closed
    if (complaint.status !== 'resolved' && complaint.status !== 'closed') {
      return NextResponse.json(
        {
          error: `Ticket ${complaint.ticket_number} is in status '${complaint.status}'. Citizen feedback is only permitted on resolved or closed complaints.`,
        },
        { status: 400 }
      );
    }

    const outcome = await applyCitizenFeedback(complaint, rating, trimmedFeedback, persists);

    return NextResponse.json({
      success: true,
      complaint: outcome.complaint,
      ticket: outcome.complaint,
      reopened: outcome.reopened,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error submitting citizen feedback';
    console.error('[feedback] Failure:', message);
    return NextResponse.json({ error: 'Internal error processing feedback.' }, { status: 500 });
  }
}
