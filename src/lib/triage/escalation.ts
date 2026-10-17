import { StorageService } from '@/lib/db/storage';
import { dispatchNotification } from '@/lib/notifications/dispatcher';

export interface EscalationResult {
  checked_count: number;
  escalated_count: number;
  escalated_tickets: {
    id: string;
    ticket_number: string;
    escalation_level: number;
    department: string;
  }[];
}

/**
 * Runs SLA watchdog scan to detect overdue complaints.
 * Idempotent: avoids repeatedly escalating tickets at the same threshold.
 */
export async function runSlaWatchdog(): Promise<EscalationResult> {
  const allTickets = (await StorageService.getComplaints({ limit: 1000 })).data;
  const now = Date.now();
  const eligible = allTickets.filter((t) => {
    if (t.status === 'resolved' || t.status === 'closed' || t.status === 'rejected') {
      return false;
    }
    const dueTime = new Date(t.sla_due_at).getTime();
    return dueTime < now;
  });

  const escalatedList: EscalationResult['escalated_tickets'] = [];

  for (const ticket of eligible) {
    // Only escalate if not already escalated to level 1, or if overdue by another 24 hours for level 2
    const currentLevel = ticket.escalation_level || 0;
    const hoursOverdue = Math.max(0, (now - new Date(ticket.sla_due_at).getTime()) / (3600 * 1000));

    let shouldEscalate = false;
    let newLevel = currentLevel;

    if (currentLevel === 0) {
      shouldEscalate = true;
      newLevel = 1;
    } else if (currentLevel === 1 && hoursOverdue > 24) {
      shouldEscalate = true;
      newLevel = 2;
    }

    if (shouldEscalate) {
      const department = ticket.department_id
        ? await StorageService.getDepartmentById(ticket.department_id)
        : null;

      const escalationContact = department?.escalation_contact || process.env.PILOT_ESCALATION_EMAIL || null;

      await StorageService.updateComplaint(ticket.id, {
        status: 'escalated',
        sla_breached: true,
        escalation_level: newLevel,
        escalated_at: new Date().toISOString(),
      });

      await StorageService.addComplaintEvent({
        complaint_id: ticket.id,
        event_type: 'escalation',
        actor: 'SLA Watchdog Worker',
        description: `SLA breach detected (${hoursOverdue.toFixed(1)}h overdue). Escalated to Tier ${newLevel} in the pilot review queue${escalationContact ? ` (${escalationContact})` : ''}.`,
        metadata: {
          previous_level: currentLevel,
          new_level: newLevel,
          hours_overdue: hoursOverdue,
          escalation_contact: escalationContact,
        },
      });

      // Dispatch urgent escalation notification
      if (escalationContact) {
        await dispatchNotification({
          complaint_id: ticket.id,
          recipient: escalationContact,
          channel: 'email',
          message_type: 'ticket_escalated',
          subject: `[URGENT SLA ESCALATION] ${ticket.ticket_number} Overdue in ${department?.name || 'Civic'}`,
          body: `Ticket ${ticket.ticket_number} (${ticket.ai_summary}) has breached its resolution SLA by ${hoursOverdue.toFixed(1)} hours. Status escalated to Tier ${newLevel}. Please intervene.`,
        });
      }

      escalatedList.push({
        id: ticket.id,
        ticket_number: ticket.ticket_number,
        escalation_level: newLevel,
        department: department?.name || 'Ombudsman',
      });
    }
  }

  return {
    checked_count: eligible.length,
    escalated_count: escalatedList.length,
    escalated_tickets: escalatedList,
  };
}
