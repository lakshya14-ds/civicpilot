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
