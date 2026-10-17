-- CivicPilot Database Schema Migration
-- Compatible with Supabase PostgreSQL (with pgvector support where available)

-- 1. Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS "vector";
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pgvector extension not available in this instance, skipping vector type.';
END $$;

-- 2. Ticket Number Sequence
CREATE SEQUENCE IF NOT EXISTS civicpilot_ticket_seq START WITH 1001;

CREATE OR REPLACE FUNCTION generate_ticket_number()
RETURNS TEXT AS $$
DECLARE
  current_yr TEXT := to_char(CURRENT_DATE, 'YYYY');
  seq_val BIGINT := nextval('civicpilot_ticket_seq');
BEGIN
  RETURN 'CP-' || current_yr || '-' || lpad(seq_val::text, 5, '0');
END;
$$ LANGUAGE plpgsql;

-- 3. Departments Table
CREATE TABLE IF NOT EXISTS departments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  supported_categories TEXT[] NOT NULL DEFAULT '{}',
  contact_email TEXT,
  escalation_contact TEXT,
  default_sla_hours INTEGER NOT NULL DEFAULT 48,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Complaints Table
CREATE TABLE IF NOT EXISTS complaints (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ticket_number TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL,
  ai_summary TEXT,
  category TEXT NOT NULL,
  subcategory TEXT,
  severity INTEGER NOT NULL CHECK (severity >= 1 AND severity <= 5),
  priority_score NUMERIC(5,2) NOT NULL DEFAULT 1.00,
  priority_label TEXT NOT NULL CHECK (priority_label IN ('low', 'medium', 'high', 'critical')),
  confidence_score NUMERIC(4,3) NOT NULL DEFAULT 0.500,
  language TEXT NOT NULL DEFAULT 'en',
  location_text TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  citizen_name TEXT,
  citizen_contact TEXT,
  image_url TEXT,
  source_channel TEXT NOT NULL DEFAULT 'web',
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'pending_review', 'escalated', 'resolved', 'closed', 'rejected')),
  department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
  duplicate_of UUID REFERENCES complaints(id) ON DELETE SET NULL,
  duplicate_count INTEGER NOT NULL DEFAULT 0,
  requires_human_review BOOLEAN NOT NULL DEFAULT false,
  review_status TEXT NOT NULL DEFAULT 'none' CHECK (review_status IN ('none', 'pending', 'approved', 'rejected', 'modified')),
  sla_due_at TIMESTAMPTZ,
  sla_breached BOOLEAN NOT NULL DEFAULT false,
  escalation_level INTEGER NOT NULL DEFAULT 0,
  escalated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  resolution_notes TEXT,
  resolution_evidence_url TEXT,
  citizen_rating INTEGER CHECK (citizen_rating >= 1 AND citizen_rating <= 5),
  citizen_feedback TEXT,
  idempotency_key TEXT UNIQUE
);

-- 5. Complaint Events (Audit History)
CREATE TABLE IF NOT EXISTS complaint_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  complaint_id UUID NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  actor TEXT NOT NULL,
  description TEXT NOT NULL,
  previous_state JSONB,
  new_state JSONB,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. AI Decisions Log
CREATE TABLE IF NOT EXISTS ai_decisions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  complaint_id UUID REFERENCES complaints(id) ON DELETE CASCADE,
  model_name TEXT NOT NULL,
  decision_type TEXT NOT NULL CHECK (decision_type IN ('triage', 'duplicate_detection', 'priority_calculation', 'safety_flag', 'fallback')),
  raw_input TEXT,
  structured_output JSONB NOT NULL,
  confidence NUMERIC(4,3),
  execution_time_ms INTEGER,
  reasoning_summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7. Review Actions
CREATE TABLE IF NOT EXISTS review_actions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  complaint_id UUID NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
  reviewer_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('approved', 'rejected', 'modified')),
  previous_values JSONB NOT NULL,
  updated_values JSONB NOT NULL,
  reviewer_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 8. Notifications
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  complaint_id UUID REFERENCES complaints(id) ON DELETE SET NULL,
  recipient TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('email', 'telegram', 'sms', 'in_app', 'webhook')),
  message_type TEXT NOT NULL CHECK (message_type IN ('ticket_received', 'ticket_assigned', 'review_requested', 'ticket_escalated', 'ticket_resolved', 'feedback_requested')),
  subject TEXT,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'delivered', 'failed', 'simulated')),
  failure_reason TEXT,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 9. Complaint Embeddings (Vector search for deduplication)
CREATE TABLE IF NOT EXISTS complaint_embeddings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  complaint_id UUID NOT NULL UNIQUE REFERENCES complaints(id) ON DELETE CASCADE,
  normalized_text TEXT NOT NULL,
  embedding_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 10. Indexes for Fast Civic Operations
CREATE INDEX IF NOT EXISTS idx_complaints_status ON complaints(status);
CREATE INDEX IF NOT EXISTS idx_complaints_category ON complaints(category);
CREATE INDEX IF NOT EXISTS idx_complaints_priority ON complaints(priority_label);
CREATE INDEX IF NOT EXISTS idx_complaints_dept ON complaints(department_id);
CREATE INDEX IF NOT EXISTS idx_complaints_sla ON complaints(sla_due_at, status);
CREATE INDEX IF NOT EXISTS idx_complaints_review ON complaints(requires_human_review, review_status);
CREATE INDEX IF NOT EXISTS idx_complaints_created_at ON complaints(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_complaint ON complaint_events(complaint_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_decisions_complaint ON ai_decisions(complaint_id);
CREATE INDEX IF NOT EXISTS idx_notifications_complaint ON notifications(complaint_id);

-- 11. Updated_at Trigger
CREATE OR REPLACE FUNCTION trigger_set_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_timestamp_complaints
BEFORE UPDATE ON complaints
FOR EACH ROW
EXECUTE PROCEDURE trigger_set_timestamp();

CREATE TRIGGER set_timestamp_departments
BEFORE UPDATE ON departments
FOR EACH ROW
EXECUTE PROCEDURE trigger_set_timestamp();

-- 12. Row Level Security Policies (Supabase Hardened)
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE complaints ENABLE ROW LEVEL SECURITY;
ALTER TABLE complaint_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE complaint_embeddings ENABLE ROW LEVEL SECURITY;

-- Departments: Public can view active departments only
CREATE POLICY "Public read active departments" ON departments
  FOR SELECT TO anon, authenticated
  USING (active = true);

CREATE POLICY "Privileged manage departments" ON departments
  FOR ALL TO service_role, authenticated
  USING (true) WITH CHECK (true);

-- Complaints: Anonymous direct access blocked to prevent PII harvesting.
-- All citizen queries and submissions are mediated through server-side APIs.
CREATE POLICY "Privileged manage complaints" ON complaints
  FOR ALL TO service_role, authenticated
  USING (true) WITH CHECK (true);

-- Complaint Events: Restricted to privileged server/staff roles
CREATE POLICY "Privileged manage events" ON complaint_events
  FOR ALL TO service_role, authenticated
  USING (true) WITH CHECK (true);

-- AI Decisions: Restricted to privileged server/staff roles
CREATE POLICY "Privileged manage ai_decisions" ON ai_decisions
  FOR ALL TO service_role, authenticated
  USING (true) WITH CHECK (true);

-- Review Actions: Restricted to privileged server/staff roles
CREATE POLICY "Privileged manage review_actions" ON review_actions
  FOR ALL TO service_role, authenticated
  USING (true) WITH CHECK (true);

-- Notifications: Restricted to privileged server/staff roles
CREATE POLICY "Privileged manage notifications" ON notifications
  FOR ALL TO service_role, authenticated
  USING (true) WITH CHECK (true);

-- Embeddings: Restricted to privileged server/staff roles
CREATE POLICY "Privileged manage embeddings" ON complaint_embeddings
  FOR ALL TO service_role, authenticated
  USING (true) WITH CHECK (true);
