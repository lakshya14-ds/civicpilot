import { NextRequest, NextResponse } from 'next/server';
import { StorageService } from '@/lib/db/storage';
import { dispatchNotification } from '@/lib/notifications/dispatcher';
import { constantTimeCompare } from '@/lib/security/auth';
import { checkRateLimit, getClientIp } from '@/lib/security/rateLimit';
import { PriorityLabel, ComplaintStatus, ComplaintCategory } from '@/types';

const VALID_ACTIONS = new Set(['approved', 'rejected', 'modified']);
const VALID_CATEGORIES: Set<ComplaintCategory> = new Set([
  'roads',
  'sanitation',
  'water_supply',
  'electrical',
  'public_safety',
  'drainage',
  'other',
]);
const VALID_PRIORITIES = new Set<PriorityLabel>(['low', 'medium', 'high', 'critical']);

export async function POST(req: NextRequest) {
  try {
    const clientIp = getClientIp(req.headers);
    const rateLimit = checkRateLimit(`review:${clientIp}`, {
      windowMs: 60 * 1000,
      maxRequests: 30,
    });

    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Rate limit exceeded for human review actions. Please wait before retrying.' },
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
      return NextResponse.json({ error: 'Invalid JSON request payload' }, { status: 400 });
    }

    const {
      complaint_id,
      action,
      reviewer_id,
      reviewer_secret,
      reviewer_notes,
      updated_values,
    } = body;

    // 1. Strict Server-Side Reviewer Authorization (Fail Closed, Timing-Safe)
    const serverSecret = process.env.REVIEWER_SECRET_KEY;
    if (!serverSecret) {
      console.error('[Security Audit] REVIEWER_SECRET_KEY is not configured on the server');
      return NextResponse.json(
        { error: 'Server configuration error: Reviewer authorization secret not configured.' },
        { status: 500 }
      );
    }

    const providedSecret =
      req.headers.get('x-reviewer-secret') ||
      (typeof reviewer_secret === 'string' ? reviewer_secret : null);

    if (!providedSecret || !constantTimeCompare(providedSecret, serverSecret)) {
      return NextResponse.json(
        { error: 'Unauthorized: Invalid or missing reviewer authorization credentials.' },
        { status: 401 }
      );
    }

    // 2. Mandatory Fields Validation
    if (!complaint_id || typeof complaint_id !== 'string') {
      return NextResponse.json({ error: 'complaint_id is required and must be a string' }, { status: 400 });
    }

    // Normalize action ('approve' -> 'approved', 'reject' -> 'rejected', 'modify' -> 'modified')
    const normalizedAction =
      action === 'approve'
        ? 'approved'
        : action === 'reject'
        ? 'rejected'
        : action === 'modify'
        ? 'modified'
        : action;

    if (!normalizedAction || typeof normalizedAction !== 'string' || !VALID_ACTIONS.has(normalizedAction)) {
      return NextResponse.json(
        { error: `Invalid action '${action}'. Must be one of: approved, rejected, modified` },
        { status: 400 }
      );
    }

    if (!reviewer_id || typeof reviewer_id !== 'string' || reviewer_id.trim().length < 2) {
      return NextResponse.json(
        { error: 'reviewer_id is required and must be at least 2 characters' },
        { status: 400 }
      );
    }

    // 3. Ticket Existence & State Validation
    const complaint = await StorageService.getComplaintById(complaint_id);
    if (!complaint) {
      return NextResponse.json({ error: 'Complaint not found' }, { status: 404 });
    }

    // Verify ticket is in a state eligible for human review
    const isPendingReview =
      complaint.status === 'pending_review' ||
      complaint.requires_human_review ||
      complaint.review_status === 'pending';

    if (!isPendingReview) {
      return NextResponse.json(
        {
          error: `Ticket ${complaint.ticket_number} is in status '${complaint.status}' (review_status: '${complaint.review_status}') and is not pending human review.`,
        },
        { status: 400 }
      );
    }

    // 4. Validate Override Values if Action is Modified
    const overrideMap = (
      updated_values && typeof updated_values === 'object'
        ? (updated_values as Record<string, unknown>)
        : {}
    );

    if (normalizedAction === 'modified') {
      if (!updated_values || typeof updated_values !== 'object') {
        return NextResponse.json(
          { error: 'updated_values object is required when action is modified' },
          { status: 400 }
        );
      }

      if (overrideMap.category && !VALID_CATEGORIES.has(overrideMap.category as ComplaintCategory)) {
        return NextResponse.json(
          { error: `Invalid category '${overrideMap.category}'. Must be a supported category.` },
          { status: 400 }
        );
      }

      if (overrideMap.priority_label && !VALID_PRIORITIES.has(overrideMap.priority_label as PriorityLabel)) {
        return NextResponse.json(
          { error: `Invalid priority_label '${overrideMap.priority_label}'. Must be low, medium, high, or critical.` },
          { status: 400 }
        );
      }

      if (overrideMap.department_id && typeof overrideMap.department_id === 'string') {
        const dept = await StorageService.getDepartmentById(overrideMap.department_id);
        if (!dept) {
          return NextResponse.json(
            { error: `Department ID '${overrideMap.department_id}' not found.` },
            { status: 400 }
          );
        }
      }
    }

    const previousValues = {
      category: complaint.category,
      department_id: complaint.department_id || undefined,
      priority_label: complaint.priority_label,
      status: complaint.status,
    };

    let newStatus: ComplaintStatus = complaint.status;
    let newReviewStatus = complaint.review_status;

    const safeAction = normalizedAction as 'approved' | 'rejected' | 'modified';

    if (safeAction === 'approved') {
      newStatus = 'open';
      newReviewStatus = 'approved';
    } else if (safeAction === 'rejected') {
      newStatus = 'rejected';
      newReviewStatus = 'rejected';
    } else if (safeAction === 'modified') {
      newStatus = 'open';
      newReviewStatus = 'modified';
    }

    const updates: Partial<typeof complaint> = {
      status: newStatus,
      review_status: newReviewStatus,
      requires_human_review: false,
    };

    if (safeAction === 'modified' && updated_values) {
      if (typeof overrideMap.category === 'string') updates.category = overrideMap.category;
      if (typeof overrideMap.department_id === 'string') updates.department_id = overrideMap.department_id;
      if (typeof overrideMap.priority_label === 'string') updates.priority_label = overrideMap.priority_label as PriorityLabel;
    }

    const updatedComplaint = await StorageService.updateComplaint(complaint.id, updates);

    // Save Review Action Audit Record
    await StorageService.addReviewAction({
      complaint_id: complaint.id,
      reviewer_id: reviewer_id.trim(),
      action: safeAction,
      previous_values: previousValues,
      updated_values: overrideMap,
      reviewer_notes: reviewer_notes ? String(reviewer_notes).trim() : '',
    });

    // Save Audit Event
    await StorageService.addComplaintEvent({
      complaint_id: complaint.id,
      event_type: 'review_action',
      actor: `Officer ${reviewer_id.trim()}`,
      description: `Human review decision: ${safeAction.toUpperCase()}.${reviewer_notes ? ` Note: "${String(reviewer_notes).trim()}"` : ''}`,
      previous_state: previousValues,
      new_state: {
        status: newStatus,
        ...overrideMap,
      },
      metadata: {
        reviewer_id: reviewer_id.trim(),
        action: safeAction,
        notes: reviewer_notes || '',
      },
    });

    // If released to operations, dispatch notification
    if (newStatus === 'open') {
      await dispatchNotification({
        complaint_id: complaint.id,
        recipient: 'assigned-officer@civicpilot.gov',
        channel: 'in_app',
        message_type: 'ticket_assigned',
        subject: `Review Approved: Ticket ${complaint.ticket_number} Released`,
        body: `Ticket ${complaint.ticket_number} approved by Reviewer ${reviewer_id.trim()} and routed for operational resolution.`,
      });
    }

    return NextResponse.json({
      success: true,
      complaint: updatedComplaint,
      action,
      reviewer_id: reviewer_id.trim(),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error processing human review action';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
