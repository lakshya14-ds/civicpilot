import { Department } from '@/types';

export const DEFAULT_DEPARTMENTS: Department[] = [
  {
    id: '11111111-1111-1111-1111-111111111111',
    name: 'Bengaluru pilot roads queue',
    slug: 'roads',
    description: 'Potholes, broken pavement, asphalt erosion, traffic dividers, and sidewalk damages',
    supported_categories: ['roads', 'pothole', 'sidewalk', 'pavement', 'traffic_barrier'],
    default_sla_hours: 48,
    active: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
  {
    id: '22222222-2222-2222-2222-222222222222',
    name: 'Bengaluru pilot sanitation queue',
    slug: 'sanitation',
    description: 'Garbage overflow, illegal dumping, street sweeping, dead animals, and bin replacement',
    supported_categories: ['sanitation', 'garbage', 'waste', 'dumping', 'litter'],
    default_sla_hours: 24,
    active: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
  {
    id: '33333333-3333-3333-3333-333333333333',
    name: 'Bengaluru pilot water review',
    slug: 'water_supply',
    description: 'Main pipeline bursts, contaminated tap water, low water pressure, and open manholes',
    supported_categories: ['water_supply', 'water_leakage', 'drainage', 'flooding', 'sewage', 'pipeline'],
    default_sla_hours: 12,
    active: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
  {
    id: '44444444-4444-4444-4444-444444444444',
    name: 'Bengaluru pilot streetlight queue',
    slug: 'electrical',
    description: 'Dark streetlights, sparking electric transformers, exposed live wires, and faulty signals',
    supported_categories: ['electrical', 'streetlights', 'power_outage', 'exposed_wire', 'transformer'],
    default_sla_hours: 18,
    active: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
  {
    id: '55555555-5555-5555-5555-555555555555',
    name: 'Bengaluru pilot safety review',
    slug: 'public_safety',
    description: 'Structural collapse hazard, dangerous fallen trees, fire hazards, and aggressive strays',
    supported_categories: ['public_safety', 'hazard', 'structural_danger', 'fallen_tree', 'emergency'],
    default_sla_hours: 6,
    active: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
  {
    id: '66666666-6666-6666-6666-666666666666',
    name: 'Bengaluru pilot jurisdiction review',
    slug: 'fallback_review',
    description: 'Uncategorized civic issues, ambiguous multi-jurisdiction matters, and escalated reviews',
    supported_categories: ['other', 'unknown', 'general'],
    default_sla_hours: 36,
    active: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
];

export const CATEGORY_LABELS: Record<string, string> = {
  roads: 'Roads & Infrastructure',
  sanitation: 'Sanitation & Waste',
  water_supply: 'Water Supply & Sewage',
  electrical: 'Electrical & Lighting',
  drainage: 'Drainage & Flood Control',
  public_safety: 'Public Safety & Hazards',
  other: 'General Civic Inquiries',
};

export const STATUS_LABELS: Record<string, string> = {
  open: 'Open',
  in_progress: 'In Progress',
  pending_review: 'Pending Review',
  escalated: 'Escalated (Breached)',
  resolved: 'Resolved',
  closed: 'Closed',
  rejected: 'Rejected',
};

export const PRIORITY_LABELS: Record<string, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  critical: 'Critical',
};
