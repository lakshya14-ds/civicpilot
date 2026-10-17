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
