import {
  IntakeRequestPayload,
  Complaint,
  PriorityBreakdown,
  DuplicateCheckResult,
} from '@/types';
import { StorageService } from '@/lib/db/storage';
import { extractComplaintWithAi, StructuredAiExtraction } from '@/lib/ai/gemini';
import { checkDuplicateComplaint } from './duplicate';
import { calculatePriorityScore } from './priority';
import { routeComplaint } from './routing';
import { dispatchNotification } from '@/lib/notifications/dispatcher';

export interface IntakeResult {
  success: boolean;
  ticket: Complaint;
  is_duplicate: boolean;
  canonical_ticket?: Complaint;
  ai_extraction: StructuredAiExtraction;
  priority_breakdown: PriorityBreakdown;
  duplicate_check: DuplicateCheckResult;
}

export async function processComplaintIntake(
  payload: IntakeRequestPayload
): Promise<IntakeResult> {
  const description = (payload.description || '').trim();
  if (description.length < 5) {
    throw new Error('Complaint description must be at least 5 characters long.');
  }

  // 1. Idempotency Check
  if (payload.idempotency_key) {
    const existingTickets = (await StorageService.getComplaints({ limit: 1000 })).data;
    const existing = existingTickets.find((c) => c.idempotency_key === payload.idempotency_key);
    if (existing) {
      const priorityInfo = calculatePriorityScore({
        severity: existing.severity,
        safety_flags: [],
        duplicate_count: existing.duplicate_count,
      });
      return {
        success: true,
        ticket: existing,
        is_duplicate: Boolean(existing.duplicate_of),
        ai_extraction: {
          category: existing.category as StructuredAiExtraction['category'],
          subcategory: existing.subcategory || '',
          summary: existing.ai_summary,
          severity: existing.severity,
          location_text: existing.location_text,
          language: existing.language,
          confidence: existing.confidence_score,
          safety_flags: [],
          reasoning_summary: 'Retrieved via idempotency key.',
          requires_human_review: existing.requires_human_review,
          is_fallback: false,
          model_name: 'cached-idempotent',
        },
        priority_breakdown: priorityInfo,
        duplicate_check: {
          is_duplicate: Boolean(existing.duplicate_of),
          confidence: 1.0,
          similarity_reason: 'Idempotent request submission.',
          stage: 'none',
        },
      };
    }
  }

  // 2. Explicit Processing Mode Selection
  // When INTAKE_PROCESSING_MODE === 'n8n', we route strictly through the n8n orchestration workflow.
  // CRITICAL RULE: If n8n configuration is missing or n8n fails, we do NOT silently switch processing modes.
  const intakeMode = process.env.INTAKE_PROCESSING_MODE || 'in_app';
  const n8nWebhookUrl = process.env.N8N_WEBHOOK_INTAKE_URL;
  const webhookSecret = process.env.N8N_WEBHOOK_SECRET || process.env.WEBHOOK_SHARED_SECRET;

  if (intakeMode === 'n8n') {
    if (!n8nWebhookUrl) {
      throw new Error(
        'Configuration error: INTAKE_PROCESSING_MODE is set to "n8n" but N8N_WEBHOOK_INTAKE_URL is not configured.'
      );
    }
    if (!webhookSecret) {
      throw new Error(
        'Configuration error: INTAKE_PROCESSING_MODE is set to "n8n" but N8N_WEBHOOK_SECRET (or WEBHOOK_SHARED_SECRET) is not configured.'
      );
    }

    let webhookRes: Response;
    try {
      webhookRes = await fetch(n8nWebhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-webhook-secret': webhookSecret,
        },
        body: JSON.stringify(payload),
      });
    } catch (networkErr: unknown) {
      const msg = networkErr instanceof Error ? networkErr.message : 'Network failure';
      throw new Error(`n8n intake workflow unreachable: ${msg}`);
    }

    if (!webhookRes.ok) {
      const errText = await webhookRes.text();
      throw new Error(`n8n intake workflow returned error HTTP ${webhookRes.status}: ${errText}`);
    }

    const webhookData = await webhookRes.json();
    if (!webhookData?.success || !webhookData.ticket || !webhookData.ai_extraction || !webhookData.priority_breakdown || !webhookData.duplicate_check) {
      throw new Error('n8n intake workflow returned an incomplete intake result.');
    }

    return webhookData as IntakeResult;
  }

  // 3. In-App AI Extraction with Gemini & Schema Validation
  const aiExtraction = await extractComplaintWithAi(
    description,
    payload.location_text,
    payload.language || 'en'
  );

  // 4. Duplicate Detection (Stage 1 & Stage 2)
  const existingComplaints = (await StorageService.getComplaints({ limit: 500 })).data;
  const duplicateCheck = checkDuplicateComplaint(
    {
      description,
      location_text: aiExtraction.location_text,
      category: aiExtraction.category,
    },
    existingComplaints
  );

  // Handle Confirmed Duplicate
  if (duplicateCheck.is_duplicate && duplicateCheck.canonical_complaint) {
    const canonical = duplicateCheck.canonical_complaint;

    // Increment canonical report count
    const updatedCanonicalCount = (canonical.duplicate_count || 0) + 1;

    // Recalculate canonical priority with crowd boost
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
      description: `Additional citizen report received. Priority updated to ${updatedPriority.priority_label.toUpperCase()} (Total reports: ${updatedCanonicalCount + 1})`,
      metadata: {
        similarity_score: duplicateCheck.confidence,
        reason: duplicateCheck.similarity_reason,
      },
    });

    // Create the child ticket linked to canonical
    const childTicket = await StorageService.createComplaint({
      description,
      ai_summary: aiExtraction.summary,
      category: aiExtraction.category,
      subcategory: aiExtraction.subcategory,
      severity: aiExtraction.severity,
      priority_score: updatedPriority.total_score,
      priority_label: updatedPriority.priority_label,
      confidence_score: aiExtraction.confidence,
      language: aiExtraction.language,
      location_text: aiExtraction.location_text,
      latitude: payload.latitude,
      longitude: payload.longitude,
      citizen_name: payload.citizen_name || null,
      citizen_contact: payload.citizen_contact || null,
      image_url: payload.image_url || null,
      source_channel: payload.source_channel || 'web',
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
      idempotency_key: payload.idempotency_key || null,
    });

    // Dispatch citizen notification with canonical reference
    if (payload.citizen_contact) {
      await dispatchNotification({
        complaint_id: childTicket.id,
        recipient: payload.citizen_contact,
        channel: payload.citizen_contact.includes('@') ? 'email' : 'sms',
        message_type: 'ticket_received',
        subject: `CivicPilot Report Linked: ${childTicket.ticket_number}`,
        body: `Thank you for reporting. Your report matches active incident ${canonical.ticket_number}. We have added your report to accelerate resolution. Tracking ID: ${childTicket.ticket_number}`,
      });
    }

    return {
      success: true,
      ticket: childTicket,
      is_duplicate: true,
      canonical_ticket: canonical,
      ai_extraction: aiExtraction,
      priority_breakdown: updatedPriority,
      duplicate_check: duplicateCheck,
    };
  }

  // 5. Fresh Canonical Ticket Processing
  const departments = await StorageService.getDepartments();
  const routing = routeComplaint(
    aiExtraction.category,
    aiExtraction.subcategory,
    aiExtraction.confidence,
    aiExtraction.safety_flags,
    aiExtraction.requires_human_review,
    departments
  );

  const priorityBreakdown = calculatePriorityScore({
    severity: aiExtraction.severity,
    safety_flags: aiExtraction.safety_flags,
    duplicate_count: 0,
  });

  const slaHours = routing.department.default_sla_hours || 48;
  const slaDueAt = new Date(Date.now() + slaHours * 3600 * 1000).toISOString();

  const initialStatus = routing.requires_human_review ? 'pending_review' : 'open';
  const initialReviewStatus = routing.requires_human_review ? 'pending' : 'none';

  const ticket = await StorageService.createComplaint({
    description,
    ai_summary: aiExtraction.summary,
    category: aiExtraction.category,
    subcategory: aiExtraction.subcategory,
    severity: aiExtraction.severity,
    priority_score: priorityBreakdown.total_score,
    priority_label: priorityBreakdown.priority_label,
    confidence_score: aiExtraction.confidence,
    language: aiExtraction.language,
    location_text: aiExtraction.location_text,
    latitude: payload.latitude,
    longitude: payload.longitude,
    citizen_name: payload.citizen_name || null,
    citizen_contact: payload.citizen_contact || null,
    image_url: payload.image_url || null,
    source_channel: payload.source_channel || 'web',
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
    idempotency_key: payload.idempotency_key || null,
  });

  // Log AI Decision record
  await StorageService.addAiDecision({
    complaint_id: ticket.id,
    model_name: aiExtraction.model_name,
    decision_type: aiExtraction.is_fallback ? 'fallback' : 'triage',
    raw_input: description,
    structured_output: {
      category: aiExtraction.category,
      subcategory: aiExtraction.subcategory,
      severity: aiExtraction.severity,
      confidence: aiExtraction.confidence,
      safety_flags: aiExtraction.safety_flags,
      summary: aiExtraction.summary,
    },
    confidence: aiExtraction.confidence,
    execution_time_ms: 320,
    reasoning_summary: aiExtraction.reasoning_summary,
  });

  // Record Assignment Event
  await StorageService.addComplaintEvent({
    complaint_id: ticket.id,
    event_type: 'assignment',
    actor: 'Civic Routing Engine',
    description: `Assigned to ${routing.department.name} with ${priorityBreakdown.priority_label.toUpperCase()} priority (${slaHours}h SLA).`,
    metadata: {
      department_id: routing.department.id,
      priority: priorityBreakdown.priority_label,
      requires_review: routing.requires_human_review,
      review_reasons: routing.review_reasons,
    },
  });

  // Dispatch Notifications
  if (payload.citizen_contact) {
    await dispatchNotification({
      complaint_id: ticket.id,
      recipient: payload.citizen_contact,
      channel: payload.citizen_contact.includes('@') ? 'email' : 'sms',
      message_type: 'ticket_received',
      subject: `CivicPilot Complaint Registered: ${ticket.ticket_number}`,
      body: `Your civic complaint has been registered as ${ticket.ticket_number}. Department: ${routing.department.name}. Estimated SLA: ${slaHours} hours.`,
    });
  }

  if (routing.requires_human_review) {
    await dispatchNotification({
      complaint_id: ticket.id,
      recipient: 'officers@civicpilot.gov',
      channel: 'in_app',
      message_type: 'review_requested',
      subject: `Human Review Required: ${ticket.ticket_number}`,
      body: `Ticket ${ticket.ticket_number} requires officer review: ${routing.review_reasons.join(', ')}`,
    });
  }

  return {
    success: true,
    ticket,
    is_duplicate: false,
    ai_extraction: aiExtraction,
    priority_breakdown: priorityBreakdown,
    duplicate_check: duplicateCheck,
  };
}
