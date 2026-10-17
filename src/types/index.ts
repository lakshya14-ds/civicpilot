export type ComplaintCategory =
  | 'roads'
  | 'sanitation'
  | 'water_supply'
  | 'electrical'
  | 'public_safety'
  | 'drainage'
  | 'other';

export type PriorityLabel = 'low' | 'medium' | 'high' | 'critical';

export type ComplaintStatus =
  | 'open'
  | 'in_progress'
  | 'pending_review'
  | 'escalated'
  | 'resolved'
  | 'closed'
  | 'rejected';

export type ReviewStatus = 'none' | 'pending' | 'approved' | 'rejected' | 'modified';

export type NotificationChannel = 'email' | 'telegram' | 'sms' | 'in_app' | 'webhook';

export type NotificationType =
  | 'ticket_received'
  | 'ticket_assigned'
  | 'review_requested'
  | 'ticket_escalated'
  | 'ticket_resolved'
  | 'feedback_requested';

export interface Department {
  id: string;
  name: string;
  slug: string;
  description?: string;
  supported_categories: string[];
  contact_email?: string;
  escalation_contact?: string;
  default_sla_hours: number;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Complaint {
  id: string;
  ticket_number: string;
  description: string;
  ai_summary: string;
  category: ComplaintCategory | string;
  subcategory?: string;
  severity: number; // 1 to 5
  priority_score: number; // calculated formula (e.g. 1.0 - 5.0+)
  priority_label: PriorityLabel;
  confidence_score: number; // 0.00 to 1.00
  language: string;
  location_text: string;
  latitude?: number | null;
  longitude?: number | null;
  citizen_name?: string | null;
  citizen_contact?: string | null;
  image_url?: string | null;
  source_channel: 'web' | 'telegram' | 'email' | 'voice' | string;
  status: ComplaintStatus;
  department_id?: string | null;
  department_name?: string;
  duplicate_of?: string | null;
  duplicate_count: number;
  requires_human_review: boolean;
  review_status: ReviewStatus;
  sla_due_at: string;
  sla_breached: boolean;
  escalation_level: number;
  escalated_at?: string | null;
  created_at: string;
  updated_at: string;
  resolved_at?: string | null;
  resolution_notes?: string | null;
  resolution_evidence_url?: string | null;
  citizen_rating?: number | null;
  citizen_feedback?: string | null;
  idempotency_key?: string | null;
  government_provider?: string | null;
  official_reference?: string | null;
  government_status?: string | null;
  government_synced_at?: string | null;
}

export interface ComplaintEvent {
  id: string;
  complaint_id: string;
  event_type:
    | 'intake'
    | 'assignment'
    | 'status_change'
    | 'review_action'
    | 'escalation'
    | 'notification'
    | 'duplicate_merged'
    | 'feedback'
    | 'resolution';
  actor: string;
  description: string;
  previous_state?: Record<string, unknown> | null;
  new_state?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
  created_at: string;
}

export interface AiDecision {
  id: string;
  complaint_id?: string | null;
  model_name: string;
  decision_type: 'triage' | 'duplicate_detection' | 'priority_calculation' | 'safety_flag' | 'fallback';
  raw_input?: string;
  structured_output: Record<string, unknown>;
  confidence: number;
  execution_time_ms?: number;
  reasoning_summary?: string;
  created_at: string;
}

export interface ReviewAction {
  id: string;
  complaint_id: string;
  reviewer_id: string;
  action: 'approved' | 'rejected' | 'modified';
  previous_values: {
    category?: string;
    department_id?: string;
    priority_label?: PriorityLabel;
    status?: ComplaintStatus;
  };
  updated_values: {
    category?: string;
    department_id?: string;
    priority_label?: PriorityLabel;
    status?: ComplaintStatus;
  };
  reviewer_notes?: string;
  created_at: string;
}

export interface NotificationRecord {
  id: string;
  complaint_id?: string | null;
  recipient: string;
  channel: NotificationChannel;
  message_type: NotificationType;
  subject?: string;
  body: string;
  status: 'pending' | 'delivered' | 'failed' | 'simulated';
  failure_reason?: string | null;
  delivered_at?: string | null;
  created_at: string;
}

export interface IntakeRequestPayload {
  description: string;
  location_text?: string;
  latitude?: number | null;
  longitude?: number | null;
  citizen_name?: string | null;
  citizen_contact?: string | null;
  image_url?: string | null;
  language?: string;
  source_channel?: string;
  idempotency_key?: string;
}

export interface AiTriageResult {
  category: ComplaintCategory;
  subcategory: string;
  summary: string;
  severity: number;
  location_text: string;
  language: string;
  confidence: number;
  safety_flags: string[];
  reasoning_summary: string;
  requires_human_review: boolean;
  priority_score: number;
  priority_label: PriorityLabel;
  assigned_department_id: string;
  assigned_department_name: string;
}

export interface PriorityBreakdown {
  base_severity_weight: number;
  safety_multiplier: number;
  duplicate_crowd_boost: number;
  sla_urgency_factor: number;
  total_score: number;
  priority_label: PriorityLabel;
}

export interface DuplicateCheckResult {
  is_duplicate: boolean;
  confidence: number;
  canonical_complaint?: Complaint;
  similarity_reason: string;
  stage: 'none' | 'stage1_deterministic' | 'stage2_semantic';
}
