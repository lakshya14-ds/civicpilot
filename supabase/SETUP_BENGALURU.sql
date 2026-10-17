-- CivicPilot Bengaluru: one-time setup for a new, empty Supabase project.
-- Run once in the Supabase SQL Editor. No sample citizen complaints are inserted.
BEGIN;

-- Source: 20260101000000_civicpilot_schema.sql

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


-- Source: 20260102000000_tighten_rls_policies.sql

-- CivicPilot Security Hardening Migration
-- Tighten Row Level Security to enforce strict least-privilege access control.
-- Revokes broad "authenticated" access and ensures ordinary citizens cannot query or mutate
-- arbitrary dockets, audit logs, AI decisions, review actions, or notifications.

-- 1. Drop previously permissive or legacy policies
DROP POLICY IF EXISTS "Public read complaints" ON complaints;
DROP POLICY IF EXISTS "Public insert complaints" ON complaints;
DROP POLICY IF EXISTS "Service and staff manage complaints" ON complaints;
DROP POLICY IF EXISTS "Privileged manage complaints" ON complaints;

DROP POLICY IF EXISTS "Public read events" ON complaint_events;
DROP POLICY IF EXISTS "Manage events" ON complaint_events;
DROP POLICY IF EXISTS "Privileged manage events" ON complaint_events;

DROP POLICY IF EXISTS "Manage ai_decisions" ON ai_decisions;
DROP POLICY IF EXISTS "Privileged manage ai_decisions" ON ai_decisions;

DROP POLICY IF EXISTS "Manage review_actions" ON review_actions;
DROP POLICY IF EXISTS "Privileged manage review_actions" ON review_actions;

DROP POLICY IF EXISTS "Manage notifications" ON notifications;
DROP POLICY IF EXISTS "Privileged manage notifications" ON notifications;

DROP POLICY IF EXISTS "Manage embeddings" ON complaint_embeddings;
DROP POLICY IF EXISTS "Privileged manage embeddings" ON complaint_embeddings;

DROP POLICY IF EXISTS "Public read departments" ON departments;
DROP POLICY IF EXISTS "Public read active departments" ON departments;
DROP POLICY IF EXISTS "Privileged manage departments" ON departments;

-- 2. Departments Table Policies
-- Anonymous & Authenticated users may read active departments (required for intake dropdowns)
CREATE POLICY "Public read active departments" ON departments
  FOR SELECT TO anon, authenticated
  USING (active = true);

-- Only service_role and verified staff administrators can modify departments
CREATE POLICY "Staff manage departments" ON departments
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Admin manage departments" ON departments
  FOR ALL TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'supervisor'))
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'supervisor'));

-- 3. Complaints Table Policies
-- Trusted server-side backend (service_role) has full docket management access
CREATE POLICY "Service role manage complaints" ON complaints
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Authenticated municipal staff can inspect and manage complaints
CREATE POLICY "Staff manage complaints" ON complaints
  FOR ALL TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('officer', 'admin', 'supervisor'))
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('officer', 'admin', 'supervisor'));

-- Authenticated citizens can ONLY view their own filed complaints matching their verified email
CREATE POLICY "Citizen view own complaints" ON complaints
  FOR SELECT TO authenticated
  USING (
    citizen_contact IS NOT NULL AND
    citizen_contact = (auth.jwt() ->> 'email')
  );

-- 4. Complaint Events (Audit Log) Policies
-- Only service_role and verified staff can read audit trails; ordinary citizens cannot
CREATE POLICY "Service role manage events" ON complaint_events
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Staff view events" ON complaint_events
  FOR SELECT TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('officer', 'admin', 'supervisor'));

-- 5. AI Decisions Policies
-- Confidential internal AI prompt logs & reasoning summaries: strictly service_role and staff
CREATE POLICY "Service role manage ai_decisions" ON ai_decisions
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Staff view ai_decisions" ON ai_decisions
  FOR SELECT TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('officer', 'admin', 'supervisor'));

-- 6. Review Actions Policies
-- Confidential officer review decisions: strictly service_role and staff
CREATE POLICY "Service role manage review_actions" ON review_actions
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Staff view review_actions" ON review_actions
  FOR SELECT TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('officer', 'admin', 'supervisor'));

-- 7. Notifications Policies
-- Outbound communications audit: strictly service_role and staff
CREATE POLICY "Service role manage notifications" ON notifications
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Staff view notifications" ON notifications
  FOR SELECT TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('officer', 'admin', 'supervisor'));

-- 8. Embeddings Policies
-- Vector similarity store: strictly service_role and staff
CREATE POLICY "Service role manage embeddings" ON complaint_embeddings
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);


-- Source: 20261017000000_civic_incident_channels.sql

-- Private citizen evidence. Only the service role uploads/downloads; no public policy is added.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('civic-evidence', 'civic-evidence', false, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE TABLE IF NOT EXISTS conversation_drafts (
  sender TEXT PRIMARY KEY,
  first_message_id TEXT NOT NULL,
  stage TEXT NOT NULL CHECK (stage IN ('description', 'location')),
  description TEXT,
  image_reference TEXT,
  location_text TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  language TEXT NOT NULL DEFAULT 'en',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + interval '24 hours'
);
CREATE INDEX IF NOT EXISTS idx_conversation_drafts_expiry ON conversation_drafts (expires_at);
ALTER TABLE conversation_drafts ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS channel_messages (
  message_id TEXT PRIMARY KEY,
  sender TEXT NOT NULL,
  response JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_channel_messages_created ON channel_messages (created_at);
ALTER TABLE channel_messages ENABLE ROW LEVEL SECURITY;

ALTER TABLE complaints ADD COLUMN IF NOT EXISTS government_provider TEXT;
ALTER TABLE complaints ADD COLUMN IF NOT EXISTS official_reference TEXT;
ALTER TABLE complaints ADD COLUMN IF NOT EXISTS government_status TEXT;
ALTER TABLE complaints ADD COLUMN IF NOT EXISTS government_synced_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_complaints_official_reference ON complaints (official_reference) WHERE official_reference IS NOT NULL;


-- Source: 20261017010000_bengaluru_pilot_queues.sql

-- Internal pilot queues are not government departments or delivery addresses.
UPDATE departments
SET name = CASE slug
  WHEN 'roads' THEN 'Bengaluru pilot roads queue'
  WHEN 'sanitation' THEN 'Bengaluru pilot sanitation queue'
  WHEN 'electrical' THEN 'Bengaluru pilot streetlight queue'
  WHEN 'fallback_review' THEN 'Bengaluru pilot jurisdiction review'
  ELSE name
END,
contact_email = NULL,
escalation_contact = NULL,
updated_at = NOW()
WHERE slug IN ('roads', 'sanitation', 'water_supply', 'electrical', 'public_safety', 'fallback_review');


-- Source: 20261017020000_bengaluru_pilot_departments.sql

-- Seed internal pilot queues only. These are not official government integrations.
INSERT INTO departments (
  id, name, slug, description, supported_categories,
  contact_email, escalation_contact, default_sla_hours, active
)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'Bengaluru pilot roads queue', 'roads',
   'Internal queue for road and pothole reports pending jurisdiction validation.',
   ARRAY['roads', 'pothole', 'sidewalk', 'pavement', 'traffic_barrier'], NULL, NULL, 48, true),
  ('22222222-2222-2222-2222-222222222222', 'Bengaluru pilot sanitation queue', 'sanitation',
   'Internal queue for waste and sanitation reports pending jurisdiction validation.',
   ARRAY['sanitation', 'garbage', 'waste', 'dumping', 'litter'], NULL, NULL, 24, true),
  ('33333333-3333-3333-3333-333333333333', 'Bengaluru pilot water review', 'water_supply',
   'Review-only queue for water issues outside the initial three-category pilot.',
   ARRAY['water_supply', 'water_leakage', 'drainage', 'flooding', 'sewage', 'pipeline'], NULL, NULL, 12, true),
  ('44444444-4444-4444-4444-444444444444', 'Bengaluru pilot streetlight queue', 'electrical',
   'Internal queue for streetlight reports; other electrical issues require human review.',
   ARRAY['electrical', 'streetlights', 'power_outage', 'exposed_wire', 'transformer'], NULL, NULL, 18, true),
  ('55555555-5555-5555-5555-555555555555', 'Bengaluru pilot safety review', 'public_safety',
   'Review-only queue for public safety concerns; no emergency dispatch is implied.',
   ARRAY['public_safety', 'hazard', 'structural_danger', 'fallen_tree', 'emergency'], NULL, NULL, 6, true),
  ('66666666-6666-6666-6666-666666666666', 'Bengaluru pilot jurisdiction review', 'fallback_review',
   'Internal queue for unknown, ambiguous, and out-of-scope issues.',
   ARRAY['other', 'unknown', 'general'], NULL, NULL, 36, true)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  description = EXCLUDED.description,
  supported_categories = EXCLUDED.supported_categories,
  contact_email = NULL,
  escalation_contact = NULL,
  default_sla_hours = EXCLUDED.default_sla_hours,
  active = EXCLUDED.active,
  updated_at = NOW();

-- Ticket numbering belongs to the trusted server, not public API callers.
REVOKE ALL ON FUNCTION public.generate_ticket_number() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.generate_ticket_number() TO service_role;
REVOKE ALL ON SEQUENCE public.civicpilot_ticket_seq FROM PUBLIC;
GRANT USAGE ON SEQUENCE public.civicpilot_ticket_seq TO service_role;


COMMIT;
SELECT 'CivicPilot schema ready' AS result, COUNT(*) AS pilot_queues FROM public.departments;
