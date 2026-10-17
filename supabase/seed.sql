-- CivicPilot Database Seed Data
-- Standard Civic Departments & Benchmark Seed Complaints

-- Departments
INSERT INTO departments (id, name, slug, description, supported_categories, contact_email, escalation_contact, default_sla_hours, active)
VALUES
  (
    '11111111-1111-1111-1111-111111111111',
    'Bengaluru pilot roads queue',
    'roads',
    'Potholes, broken pavement, asphalt erosion, traffic dividers, and sidewalk damages',
    ARRAY['roads', 'pothole', 'sidewalk', 'pavement', 'traffic_barrier'],
    NULL,
    NULL,
    48,
    true
  ),
  (
    '22222222-2222-2222-2222-222222222222',
    'Bengaluru pilot sanitation queue',
    'sanitation',
    'Garbage overflow, illegal dumping, street sweeping, dead animals, and bin replacement',
    ARRAY['sanitation', 'garbage', 'waste', 'dumping', 'litter'],
    NULL,
    NULL,
    24,
    true
  ),
  (
    '33333333-3333-3333-3333-333333333333',
    'Bengaluru pilot water review',
    'water_supply',
    'Main pipeline bursts, contaminated tap water, low water pressure, and open manholes',
    ARRAY['water_supply', 'water_leakage', 'drainage', 'flooding', 'sewage', 'pipeline'],
    NULL,
    NULL,
    12,
    true
  ),
  (
    '44444444-4444-4444-4444-444444444444',
    'Bengaluru pilot streetlight queue',
    'electrical',
    'Dark streetlights, sparking electric transformers, exposed live wires, and faulty signals',
    ARRAY['electrical', 'streetlights', 'power_outage', 'exposed_wire', 'transformer'],
    NULL,
    NULL,
    18,
    true
  ),
  (
    '55555555-5555-5555-5555-555555555555',
    'Bengaluru pilot safety review',
    'public_safety',
    'Structural collapse hazard, dangerous fallen trees, fire hazards, and aggressive strays',
    ARRAY['public_safety', 'hazard', 'structural_danger', 'fallen_tree', 'emergency'],
    NULL,
    NULL,
    6,
    true
  ),
  (
    '66666666-6666-6666-6666-666666666666',
    'Bengaluru pilot jurisdiction review',
    'fallback_review',
    'Uncategorized civic issues, ambiguous multi-jurisdiction matters, and escalated reviews',
    ARRAY['other', 'unknown', 'general'],
    NULL,
    NULL,
    36,
    true
  )
ON CONFLICT (id) DO NOTHING;

-- Initial Benchmark Complaints
INSERT INTO complaints (
  id, ticket_number, description, ai_summary, category, subcategory, severity,
  priority_score, priority_label, confidence_score, language, location_text,
  citizen_name, citizen_contact, source_channel, status, department_id,
  requires_human_review, review_status, sla_due_at, created_at
) VALUES
  (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'CP-2026-01001',
    'Large deep pothole near Jayanagar 4th Block bus stand. Multiple bikes slipped yesterday during rainfall.',
    'Deep dangerous pothole near Jayanagar bus stand causing motorcycle skids.',
    'roads',
    'pothole',
    4,
    4.20,
    'high',
    0.940,
    'en',
    'Near Jayanagar 4th Block bus stand, Bengaluru',
    'Ananya Sharma',
    '+91-9876543210',
    'web',
    'in_progress',
    '11111111-1111-1111-1111-111111111111',
    false,
    'none',
    NOW() + INTERVAL '24 hours',
    NOW() - INTERVAL '6 hours'
  ),
  (
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    'CP-2026-01002',
    'Garbage dumping spot has not been cleared for 5 days. Foul smell and stray dogs tearing open black bags near primary school.',
    'Uncollected public garbage accumulation near school creating hygiene risk.',
    'sanitation',
    'garbage',
    3,
    3.10,
    'medium',
    0.910,
    'en',
    'Near Malleshwaram 8th Cross, Bengaluru',
    'Rajesh Kumar',
    'rajesh.kumar@example.com',
    'web',
    'open',
    '22222222-2222-2222-2222-222222222222',
    false,
    'none',
    NOW() + INTERVAL '12 hours',
    NOW() - INTERVAL '3 hours'
  ),
  (
    'cccccccc-cccc-cccc-cccc-cccccccccccc',
    'CP-2026-01003',
    'Major municipal water supply pipeline fractured under pavement. Water is gushing onto the street and flooding neighboring basements.',
    'Underground high-pressure water pipe burst flooding road and residential basements.',
    'water_supply',
    'pipeline_burst',
    5,
    4.95,
    'critical',
    0.970,
    'en',
    'Near Indiranagar 100 Feet Road, Bengaluru',
    'Vikram Mehta',
    '+91-9811223344',
    'web',
    'in_progress',
    '33333333-3333-3333-3333-333333333333',
    false,
    'none',
    NOW() + INTERVAL '4 hours',
    NOW() - INTERVAL '2 hours'
  ),
  (
    'dddddddd-dddd-dddd-dddd-dddddddddddd',
    'CP-2026-01004',
    'Something strange is buzzing loudly on the pole near the tea stall. Could be a bee hive or a wire, not completely sure.',
    'Audible buzzing sound near electric pole, ambiguous source needs safety verification.',
    'electrical',
    'unknown',
    2,
    2.50,
    'low',
    0.540,
    'en',
    'Near Shivajinagar bus stand, Bengaluru',
    'Manoj Tiwari',
    null,
    'web',
    'pending_review',
    '44444444-4444-4444-4444-444444444444',
    true,
    'pending',
    NOW() + INTERVAL '18 hours',
    NOW() - INTERVAL '1 hour'
  ),
  (
    'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
    'CP-2026-01005',
    'All five sodium street lamps on the flyover descent are non-functional. Completely dark at night, high risk of highway collisions.',
    'Complete blackout of street lights across 200m section of flyover descent.',
    'electrical',
    'streetlights',
    4,
    4.50,
    'high',
    0.950,
    'en',
    'Near Hebbal flyover, Bengaluru',
    'Pooja Nair',
    'pooja.nair@example.com',
    'web',
    'escalated',
    '44444444-4444-4444-4444-444444444444',
    false,
    'none',
    NOW() - INTERVAL '5 hours',
    NOW() - INTERVAL '23 hours'
  )
ON CONFLICT (id) DO NOTHING;

-- Initial Events for Audit Trail
INSERT INTO complaint_events (complaint_id, event_type, actor, description, created_at)
VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'intake', 'System AI', 'Complaint ingested from web portal and triaged to Bengaluru pilot roads queue', NOW() - INTERVAL '6 hours'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'assignment', 'Automated Router', 'Assigned priority HIGH (Score: 4.20) with 48h SLA deadline', NOW() - INTERVAL '5 hours 50 minutes'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'intake', 'System AI', 'Critical water hazard detected. Immediate emergency triage flag raised.', NOW() - INTERVAL '2 hours'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'assignment', 'Automated Router', 'Directly dispatched to Water Supply & Drainage emergency response unit', NOW() - INTERVAL '1 hour 55 minutes'),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'intake', 'System AI', 'Low confidence classification (0.540). Queued for Human Review.', NOW() - INTERVAL '1 hour'),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'escalation', 'SLA Watchdog Worker', 'SLA deadline exceeded by 5 hours without dispatch resolution. Escalated to Tier 2 Grid Supervisor.', NOW() - INTERVAL '5 hours');
