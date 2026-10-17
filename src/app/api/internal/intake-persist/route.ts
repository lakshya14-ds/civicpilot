import { NextRequest, NextResponse } from 'next/server';
import { StorageService } from '@/lib/db/storage';
import { calculatePriorityScore } from '@/lib/triage/priority';
import { routeComplaint } from '@/lib/triage/routing';
import { checkDuplicateComplaint } from '@/lib/triage/duplicate';
import { dispatchNotification } from '@/lib/notifications/dispatcher';
import { isAuthorizedWebhook } from '@/lib/security/auth';
import { Complaint, ComplaintCategory } from '@/types';
import { StructuredAiExtraction } from '@/lib/ai/gemini';

const VALID_CATEGORIES = new Set<ComplaintCategory>([
  'roads',
  'sanitation',
  'water_supply',
  'electrical',
  'public_safety',
  'drainage',
  'other',
]);

export async function POST(req: NextRequest) {
  try {
    // 1. Fail closed on missing server secret; reject unauthorized public callers
    const providedSecret = req.headers.get('x-webhook-secret');
    const auth = isAuthorizedWebhook(providedSecret);

    if (!auth.configured) {
      console.error('[intake-persist] Server misconfiguration: Webhook shared secret is missing from environment.');
      return NextResponse.json(
        { success: false, error: 'Server configuration error: Webhook authorization secret is not configured.' },
        { status: 500 }
      );
    }

    if (!auth.authorized) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized: Invalid or missing x-webhook-secret header.' },
        { status: 401 }
      );
    }

    // 2. Validate Content-Type
    const contentType = req.headers.get('content-type') || '';
    if (!contentType.toLowerCase().includes('application/json')) {
      return NextResponse.json(
        { success: false, error: 'Invalid content type: expected application/json' },
        { status: 415 }
      );
    }

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'Malformed JSON payload' },
        { status: 400 }
      );
    }

    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { success: false, error: 'Invalid request payload: must be a JSON object' },
        { status: 400 }
      );
    }

    // 3. Strict Payload Validation & Bounds Checking
    if (typeof body.description !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Complaint description is required and must be text.' },
        { status: 400 }
      );
    }

    const description = body.description.trim();
    if (description.length < 5) {
      return NextResponse.json(
        { success: false, error: 'Complaint description must be at least 5 characters.' },
        { status: 400 }
      );
    }

    if (description.length > 5000) {
      return NextResponse.json(
        { success: false, error: 'Complaint description cannot exceed 5000 characters.' },
        { status: 400 }
      );
    }

    const locationText =
      typeof body.location_text === 'string' ? body.location_text.trim().slice(0, 500) : '';

    const rawCategory = typeof body.category === 'string' ? (body.category.toLowerCase().trim() as ComplaintCategory) : 'other';
    const category: ComplaintCategory = VALID_CATEGORIES.has(rawCategory) ? rawCategory : 'other';

    const subcategory =
      typeof body.subcategory === 'string' ? body.subcategory.trim().slice(0, 100) : 'general';

    const numSeverity = Number(body.severity);
    const severity = !isNaN(numSeverity) ? Math.max(1, Math.min(5, Math.round(numSeverity))) : 3;

    const numConfidence = Number(body.confidence_score ?? body.confidence);
    const confidence = !isNaN(numConfidence) ? Math.max(0, Math.min(1, Number(numConfidence.toFixed(3)))) : 0.85;

    const safetyFlags = Array.isArray(body.safety_flags)
      ? body.safety_flags.filter((f): f is string => typeof f === 'string').slice(0, 10)
      : [];

    const aiSummary =
      typeof body.ai_summary === 'string' && body.ai_summary.trim()
        ? body.ai_summary.trim().slice(0, 255)
        : typeof body.summary === 'string' && body.summary.trim()
        ? body.summary.trim().slice(0, 255)
        : description.slice(0, 80);

    let lat: number | null = null;
    if (body.latitude !== undefined && body.latitude !== null) {
      const parsedLat = Number(body.latitude);
      if (isNaN(parsedLat) || parsedLat < -90 || parsedLat > 90) {
        return NextResponse.json({ success: false, error: 'Latitude must be between -90 and 90' }, { status: 400 });
      }
      lat = parsedLat;
    }

    let lng: number | null = null;
    if (body.longitude !== undefined && body.longitude !== null) {
      const parsedLng = Number(body.longitude);
      if (isNaN(parsedLng) || parsedLng < -180 || parsedLng > 180) {
        return NextResponse.json({ success: false, error: 'Longitude must be between -180 and 180' }, { status: 400 });
      }
      lng = parsedLng;
    }

    let imageUrl: string | null = null;
    if (typeof body.image_url === 'string' && body.image_url.trim()) {
      const trimmedUrl = body.image_url.trim();
      if (trimmedUrl.length > 2048 || (!/^evidence:\/\/[a-f0-9-]{36}\.(jpg|png|webp)$/.test(trimmedUrl) && !trimmedUrl.startsWith('https://'))) {
        return NextResponse.json({ success: false, error: 'image_url must be a private evidence reference or HTTPS URL.' }, { status: 400 });
      }
      imageUrl = trimmedUrl;
    }

    const citizenName =
      typeof body.citizen_name === 'string' ? body.citizen_name.trim().slice(0, 200) || null : null;
    const citizenContact =
      typeof body.citizen_contact === 'string' ? body.citizen_contact.trim().slice(0, 200) || null : null;
    const sourceChannel =
      typeof body.source_channel === 'string' ? body.source_channel.trim().slice(0, 50) : 'n8n_webhook';
    const language =
      typeof body.language === 'string' ? body.language.trim().slice(0, 10) : 'en';
    const idempotencyKey =
      typeof body.idempotency_key === 'string' ? body.idempotency_key.trim().slice(0, 128) || null : null;

    const reasoningSummary =
      typeof body.reasoning_summary === 'string' && body.reasoning_summary.trim()
        ? body.reasoning_summary.trim().slice(0, 500)
        : 'Processed through n8n civic triage.';
    const isRuleFallback =
      body.is_fallback === true ||
      (body.is_fallback !== false && /deterministic safety fallback/i.test(reasoningSummary));
    const recordedModelName = isRuleFallback
      ? 'n8n-deterministic-fallback'
      : process.env.GEMINI_MODEL || 'gemini-3.6-flash';
    const buildAiExtraction = (ticket: Complaint): StructuredAiExtraction => ({
      category: ticket.category as ComplaintCategory,
      subcategory: ticket.subcategory || 'general',
      summary: ticket.ai_summary,
      severity: ticket.severity,
      location_text: ticket.location_text,
      language: ticket.language,
      confidence: ticket.confidence_score,
      safety_flags: safetyFlags,
      reasoning_summary: reasoningSummary,
      requires_human_review: ticket.requires_human_review,
      is_fallback: isRuleFallback,
      model_name: recordedModelName,
    });

    // 4. Idempotency check
    if (idempotencyKey) {
      const existingTickets = (await StorageService.getComplaints({ limit: 1000 })).data;
      const existing = existingTickets.find((c) => c.idempotency_key === idempotencyKey);
      if (existing) {
        const storedPriority = calculatePriorityScore({
          severity: existing.severity,
          safety_flags: [],
          duplicate_count: existing.duplicate_count,
          sla_urgency: existing.sla_breached,
        });
        return NextResponse.json({
          success: true,
          ticket: existing,
          is_duplicate: Boolean(existing.duplicate_of),
          ai_extraction: buildAiExtraction(existing),
          priority_breakdown: {
            ...storedPriority,
            total_score: existing.priority_score,
            priority_label: existing.priority_label,
          },
          duplicate_check: {
            is_duplicate: Boolean(existing.duplicate_of),
            confidence: 1,
            similarity_reason: 'Existing report returned for the same idempotency key.',
            stage: 'none',
          },
          persisted: true,
          idempotent: true,
        });
      }
    }

    // 5. Duplicate Detection
    const existingComplaints = (await StorageService.getComplaints({ limit: 500 })).data;
    const duplicateCheck = checkDuplicateComplaint(
      {
        description,
        location_text: locationText,
        category,
      },
      existingComplaints
    );

    if (duplicateCheck.is_duplicate && duplicateCheck.canonical_complaint) {
      const canonical = duplicateCheck.canonical_complaint;
      const updatedCanonicalCount = (canonical.duplicate_count || 0) + 1;
      const updatedPriority = calculatePriorityScore({
        severity: canonical.severity,
        safety_flags: [],
        duplicate_count: updatedCanonicalCount,
        sla_urgency: canonical.sla_breached,
      });

      await StorageService.updateComplaint(canonical.id, {
        duplicate_count: updatedCanonicalCount,
        priority_score: updatedPriority.total_score,
        priority_label: updatedPriority.priority_label,
      });

      await StorageService.addComplaintEvent({
        complaint_id: canonical.id,
        event_type: 'duplicate_merged',
        actor: 'CivicPilot Deduplication Engine',
        description: `Additional citizen report received via n8n. Priority updated to ${updatedPriority.priority_label.toUpperCase()} (Total reports: ${updatedCanonicalCount + 1})`,
        metadata: {
          similarity_score: duplicateCheck.confidence,
          reason: duplicateCheck.similarity_reason,
        },
      });

      const childTicket = await StorageService.createComplaint({
        description,
        ai_summary: aiSummary,
        category,
        subcategory,
        severity,
        priority_score: updatedPriority.total_score,
        priority_label: updatedPriority.priority_label,
        confidence_score: confidence,
        language,
        location_text: locationText,
        latitude: lat,
        longitude: lng,
        citizen_name: citizenName,
        citizen_contact: citizenContact,
        image_url: imageUrl,
        source_channel: sourceChannel,
        status: 'open',
        department_id: canonical.department_id,
        duplicate_of: canonical.id,
        duplicate_count: 0,
        requires_human_review: false,
        review_status: 'none',
        sla_due_at: canonical.sla_due_at,
        sla_breached: canonical.sla_breached,
        escalation_level: canonical.escalation_level,
        escalated_at: canonical.escalated_at,
        resolved_at: null,
        resolution_notes: null,
        resolution_evidence_url: null,
        citizen_rating: null,
        citizen_feedback: null,
        idempotency_key: idempotencyKey,
      });

      if (citizenContact) {
        await dispatchNotification({
          complaint_id: childTicket.id,
          recipient: citizenContact,
          channel: citizenContact.includes('@') ? 'email' : 'sms',
          message_type: 'ticket_received',
          subject: `CivicPilot Report Linked: ${childTicket.ticket_number}`,
          body: `Thank you for reporting. Your report matches active incident ${canonical.ticket_number}. We have added your report to accelerate resolution. Tracking ID: ${childTicket.ticket_number}`,
        });
      }

      return NextResponse.json({
        success: true,
        ticket: childTicket,
        is_duplicate: true,
        canonical_ticket: canonical,
        ai_extraction: buildAiExtraction(childTicket),
        priority_breakdown: updatedPriority,
        duplicate_check: duplicateCheck,
        persisted: true,
      }, { status: 201 });
    }

    // 6. Fresh Ticket Routing & Priority Calculation
    const departments = await StorageService.getDepartments();
    const explicitReviewFlag = Boolean(body.requires_human_review);
    const routing = routeComplaint(
      category,
      subcategory,
      confidence,
      safetyFlags,
      explicitReviewFlag,
      departments
    );

    const priorityBreakdown = calculatePriorityScore({
      severity,
      safety_flags: safetyFlags,
      duplicate_count: 0,
    });

    const slaHours = routing.department.default_sla_hours || 48;
    const slaDueAt = new Date(Date.now() + slaHours * 3600 * 1000).toISOString();
    const initialStatus = routing.requires_human_review ? 'pending_review' : 'open';
    const initialReviewStatus = routing.requires_human_review ? 'pending' : 'none';

    const ticket = await StorageService.createComplaint({
      description,
      ai_summary: aiSummary,
      category,
      subcategory,
      severity,
      priority_score: priorityBreakdown.total_score,
      priority_label: priorityBreakdown.priority_label,
      confidence_score: confidence,
      language,
      location_text: locationText,
      latitude: lat,
      longitude: lng,
      citizen_name: citizenName,
      citizen_contact: citizenContact,
      image_url: imageUrl,
      source_channel: sourceChannel,
      status: initialStatus,
      department_id: routing.department.id,
      duplicate_of: null,
      duplicate_count: 0,
      requires_human_review: routing.requires_human_review,
      review_status: initialReviewStatus,
      sla_due_at: slaDueAt,
      sla_breached: false,
      escalation_level: 0,
      escalated_at: null,
      resolved_at: null,
      resolution_notes: null,
      resolution_evidence_url: null,
      citizen_rating: null,
      citizen_feedback: null,
      idempotency_key: idempotencyKey,
    });

    // 7. Record AI Decision Log
    await StorageService.addAiDecision({
      complaint_id: ticket.id,
      model_name: recordedModelName,
      decision_type: isRuleFallback ? 'fallback' : 'triage',
      raw_input: description,
      structured_output: {
        category,
        subcategory,
        severity,
        priority_label: priorityBreakdown.priority_label,
        assigned_department: routing.department.slug,
        safety_flags: safetyFlags,
        requires_human_review: routing.requires_human_review,
      },
      confidence,
      execution_time_ms: 250,
      reasoning_summary: typeof body.reasoning_summary === 'string' ? body.reasoning_summary.slice(0, 500) : 'Ingested and triaged via n8n automation pipeline.',
    });

    // 8. Record Assignment Audit Event
    await StorageService.addComplaintEvent({
      complaint_id: ticket.id,
      event_type: 'assignment',
      actor: 'n8n Automation Engine',
      description: `Assigned to ${routing.department.name} with ${priorityBreakdown.priority_label.toUpperCase()} priority (${slaHours}h SLA target).`,
      metadata: {
        department_id: routing.department.id,
        priority: priorityBreakdown.priority_label,
        requires_review: routing.requires_human_review,
        review_reasons: routing.review_reasons,
      },
    });

    // 9. Dispatch Notifications
    if (citizenContact) {
      await dispatchNotification({
        complaint_id: ticket.id,
        recipient: citizenContact,
        channel: citizenContact.includes('@') ? 'email' : 'sms',
        message_type: 'ticket_received',
        subject: `CivicPilot Complaint Registered: ${ticket.ticket_number}`,
        body: `Your complaint has been registered as ${ticket.ticket_number}. Department: ${routing.department.name}. Estimated SLA: ${slaHours} hours.`,
      });
    }

    return NextResponse.json({
      success: true,
      ticket,
      is_duplicate: false,
      ai_extraction: buildAiExtraction(ticket),
      priority_breakdown: priorityBreakdown,
      duplicate_check: duplicateCheck,
      persisted: true,
    }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal database persistence error';
    console.error('[intake-persist] Failure:', message);
    return NextResponse.json({ success: false, error: 'Internal persistence error processing complaint.' }, { status: 500 });
  }
}
