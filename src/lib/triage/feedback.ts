import { StorageService } from '@/lib/db/storage';
import { Complaint } from '@/types';

export async function applyCitizenFeedback(
  complaint: Complaint,
  rating: number,
  feedback: string | null,
  problemPersists: boolean,
) {
  if (complaint.status !== 'resolved' && complaint.status !== 'closed') {
    throw new Error('Citizen feedback requires a resolved or closed ticket.');
  }
  const reopened = problemPersists || (rating <= 2 && complaint.status === 'resolved');
  const status = reopened ? 'open' : complaint.status === 'resolved' && rating >= 4 ? 'closed' : complaint.status;
  const updated = await StorageService.updateComplaint(complaint.id, {
    citizen_rating: rating,
    citizen_feedback: feedback,
    status,
  });
  await StorageService.addComplaintEvent({
    complaint_id: complaint.id,
    event_type: 'feedback',
    actor: 'Citizen',
    description: reopened
      ? `Citizen reported that the issue persists. Ticket reopened.`
      : `Citizen submitted a ${rating}/5 resolution rating.`,
    metadata: { rating, reopened },
  });
  return { complaint: updated, reopened };
}
