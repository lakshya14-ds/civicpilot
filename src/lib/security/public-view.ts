import { Complaint, ComplaintEvent } from '@/types';
import { maskPII } from '@/lib/ai/pii-masker';

/** Public ticket data is deliberately narrower than the database row. */
export function publicComplaint(complaint: Complaint): Complaint {
  return {
    ...complaint,
    description: maskPII(complaint.description).maskedText,
    ai_summary: maskPII(complaint.ai_summary || '').maskedText,
    location_text: maskPII(complaint.location_text || '').maskedText,
    latitude: null,
    longitude: null,
    citizen_name: null,
    citizen_contact: null,
    image_url: null,
    idempotency_key: null,
    citizen_feedback: null,
    resolution_notes: complaint.resolution_notes ? maskPII(complaint.resolution_notes).maskedText : null,
    resolution_evidence_url: null,
  };
}

const EVENT_TEXT: Record<string, string> = {
  intake: 'Report received.',
  assignment: 'Report assigned to a department.',
  status_change: 'Ticket status updated.',
  review_action: 'Report reviewed by an officer.',
  escalation: 'Ticket escalated for attention.',
  notification: 'A status notification was prepared.',
  duplicate_merged: 'Another report was linked to this incident.',
  feedback: 'Citizen feedback recorded.',
  resolution: 'Officer marked work as resolved.',
};

export function publicEvent(event: ComplaintEvent): ComplaintEvent {
  return {
    id: event.id,
    complaint_id: event.complaint_id,
    event_type: event.event_type,
    actor: event.event_type === 'feedback' || event.event_type === 'intake' ? 'Citizen' : 'CivicPilot',
    description: event.event_type === 'feedback' && event.metadata?.reopened
      ? 'Citizen reported that the issue persists; ticket reopened.'
      : EVENT_TEXT[event.event_type] || 'Ticket activity recorded.',
    created_at: event.created_at,
  };
}
