import { NextRequest, NextResponse } from 'next/server';
import { StorageService } from '@/lib/db/storage';
import { isAuthorizedReviewer, isAuthorizedAdmin } from '@/lib/security/auth';
import { ComplaintStatus, PriorityLabel } from '@/types';
import { publicComplaint, publicEvent } from '@/lib/security/public-view';
import { createEvidenceSignedUrl } from '@/lib/media/evidence';

const VALID_STATUSES = new Set<ComplaintStatus>([
  'open',
  'in_progress',
  'pending_review',
  'escalated',
  'resolved',
  'closed',
  'rejected',
]);

const VALID_PRIORITIES = new Set<PriorityLabel>(['low', 'medium', 'high', 'critical']);

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const complaint = await StorageService.getComplaintById(id);

    if (!complaint) {
      return NextResponse.json({ error: 'Complaint not found' }, { status: 404 });
    }

    const staffAuthorized = isAuthorizedReviewer(req.headers.get('x-reviewer-secret')) || isAuthorizedAdmin(req.headers.get('x-admin-key'));
    const [events, aiDecisions, reviewActions, notifications] = await Promise.all([
      StorageService.getComplaintEvents(complaint.id),
      StorageService.getAiDecisions(complaint.id),
      StorageService.getReviewActions(complaint.id),
      StorageService.getNotifications(complaint.id),
    ]);

    let canonicalTicket = null;
    if (complaint.duplicate_of) {
      canonicalTicket = await StorageService.getComplaintById(complaint.duplicate_of);
    }

    const mediaUrls = staffAuthorized ? {
      report: complaint.image_url ? await createEvidenceSignedUrl(complaint.image_url) : null,
      resolution: complaint.resolution_evidence_url ? await createEvidenceSignedUrl(complaint.resolution_evidence_url) : null,
    } : { report: null, resolution: null };

    return NextResponse.json({
      complaint: staffAuthorized ? complaint : publicComplaint(complaint),
      canonical_ticket: canonicalTicket ? (staffAuthorized ? canonicalTicket : publicComplaint(canonicalTicket)) : null,
      events: staffAuthorized ? events : events.map(publicEvent),
      ai_decisions: staffAuthorized ? aiDecisions : [],
      review_actions: staffAuthorized ? reviewActions : [],
      notifications: staffAuthorized ? notifications : [],
      media_urls: mediaUrls,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error retrieving complaint details';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // 1. Authorization check for status mutations
    const isDemo = process.env.DEMO_MODE === 'true';
    const reviewerHeader = req.headers.get('x-reviewer-secret');
    const adminHeader = req.headers.get('x-admin-key');
    const demoHeader = req.headers.get('x-demo-patch');

    const isAuthorized =
      (reviewerHeader && isAuthorizedReviewer(reviewerHeader)) ||
      (adminHeader && isAuthorizedAdmin(adminHeader)) ||
      (isDemo && (demoHeader === 'civicpilot-demo-confirm' || !adminHeader));

    if (!isAuthorized) {
      return NextResponse.json(
        { error: 'Unauthorized: Staff authorization (x-reviewer-secret or x-admin-key) is required to update complaint records.' },
        { status: 401 }
      );
    }

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Malformed JSON payload' }, { status: 400 });
    }

    const existing = await StorageService.getComplaintById(id);
    if (!existing) {
      return NextResponse.json({ error: 'Complaint not found' }, { status: 404 });
    }

    const updates: Record<string, unknown> = {};

    if (body.status !== undefined) {
      if (typeof body.status !== 'string' || !VALID_STATUSES.has(body.status as ComplaintStatus)) {
        return NextResponse.json({ error: `Invalid status '${body.status}'.` }, { status: 400 });
      }
      if (body.status !== existing.status) {
        updates.status = body.status;
        if (body.status === 'resolved') {
          updates.resolved_at = new Date().toISOString();
        }
      }
    }

    if (body.resolution_notes !== undefined) {
      updates.resolution_notes =
        typeof body.resolution_notes === 'string' ? body.resolution_notes.trim().slice(0, 2000) : null;
    }

    if (body.resolution_evidence_url !== undefined) {
      updates.resolution_evidence_url =
        typeof body.resolution_evidence_url === 'string' ? body.resolution_evidence_url.trim().slice(0, 2048) : null;
    }

    if (body.department_id && body.department_id !== existing.department_id) {
      if (typeof body.department_id === 'string') {
        updates.department_id = body.department_id;
      }
    }

    if (body.priority_label !== undefined) {
      if (typeof body.priority_label !== 'string' || !VALID_PRIORITIES.has(body.priority_label as PriorityLabel)) {
        return NextResponse.json({ error: `Invalid priority_label '${body.priority_label}'.` }, { status: 400 });
      }
      if (body.priority_label !== existing.priority_label) {
        updates.priority_label = body.priority_label;
      }
    }

    const updatedComplaint = await StorageService.updateComplaint(existing.id, updates);

    // Record status transition or edit event
    const actor = typeof body.actor === 'string' ? body.actor.trim().slice(0, 100) : 'Municipal Officer';
    let eventDescription = `Ticket updated by ${actor}`;
    if (body.status && body.status !== existing.status) {
      eventDescription = `Status changed from ${existing.status.toUpperCase()} to ${String(body.status).toUpperCase()}`;
    }

    await StorageService.addComplaintEvent({
      complaint_id: existing.id,
      event_type: body.status === 'resolved' ? 'resolution' : 'status_change',
      actor,
      description: eventDescription,
      previous_state: { status: existing.status },
      new_state: { status: body.status || existing.status },
      metadata: {
        notes: updates.resolution_notes,
        evidence: updates.resolution_evidence_url,
      },
    });

    return NextResponse.json({
      success: true,
      complaint: updatedComplaint,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error updating complaint record';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
