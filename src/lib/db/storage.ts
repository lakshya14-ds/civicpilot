import {
  Complaint,
  ComplaintEvent,
  Department,
  AiDecision,
  ReviewAction,
  NotificationRecord,
} from '@/types';
import { DEFAULT_DEPARTMENTS } from '@/lib/constants';
import { getServerSupabase, isSupabaseConfigured } from './supabase';

interface ComplaintFilters {
  status?: string;
  category?: string;
  priority?: string;
  department_id?: string;
  search?: string;
  requires_human_review?: boolean;
  is_duplicate?: boolean;
  page?: number;
  limit?: number;
}

/**
 * Checks whether storage operates in durable Supabase mode or non-durable demo mode.
 */
function isSupabaseMode(): boolean {
  return process.env.DEMO_MODE !== 'true' && isSupabaseConfigured();
}

function assertStorageReady(): void {
  if (process.env.DEMO_MODE !== 'true' && !isSupabaseConfigured()) {
    console.error(
      '[Storage Configuration Error] DEMO_MODE=false but Supabase credentials (NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY) are missing.'
    );
    throw new Error('Database configuration error: Persistent database credentials are not configured.');
  }
}

// In-memory mock store for non-durable demo mode
class MemoryDataStore {
  public departments: Department[] = [...DEFAULT_DEPARTMENTS];
  public complaints: Complaint[] = [];
  public events: ComplaintEvent[] = [];
  public aiDecisions: AiDecision[] = [];
  public reviewActions: ReviewAction[] = [];
  public notifications: NotificationRecord[] = [];
  private ticketSequence: number = 1005;

  constructor() {
    this.seedDefaults();
  }

  public nextTicketNumber(): string {
    this.ticketSequence += 1;
    const year = new Date().getFullYear();
    return `CP-${year}-${String(this.ticketSequence).padStart(5, '0')}`;
  }

  public seedDefaults() {
    this.complaints = [
      {
        id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        ticket_number: 'CP-2026-01001',
        description:
          'Large deep pothole near Jayanagar 4th Block bus stand. Multiple bikes slipped yesterday during rainfall.',
        ai_summary: 'Deep dangerous pothole near Jayanagar bus stand causing motorcycle skids.',
        category: 'roads',
        subcategory: 'pothole',
        severity: 4,
        priority_score: 4.2,
        priority_label: 'high',
        confidence_score: 0.94,
        language: 'en',
        location_text: 'Near Jayanagar 4th Block bus stand, Bengaluru',
        latitude: 12.925,
        longitude: 77.594,
        citizen_name: 'Ananya Sharma',
        citizen_contact: '+91-9876543210',
        image_url: 'https://images.unsplash.com/photo-1515162816999-a0c47dc192f7?w=800',
        source_channel: 'web',
        status: 'in_progress',
        department_id: '11111111-1111-1111-1111-111111111111',
        department_name: 'Bengaluru pilot roads queue',
        duplicate_of: null,
        duplicate_count: 1,
        requires_human_review: false,
        review_status: 'none',
        sla_due_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
        sla_breached: false,
        escalation_level: 0,
        escalated_at: null,
        created_at: new Date(Date.now() - 6 * 3600 * 1000).toISOString(),
        updated_at: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
        resolved_at: null,
        resolution_notes: null,
        resolution_evidence_url: null,
        citizen_rating: null,
        citizen_feedback: null,
        idempotency_key: 'seed-key-1001',
      },
      {
        id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        ticket_number: 'CP-2026-01002',
        description:
          'Garbage dumping spot has not been cleared for 5 days. Foul smell and stray dogs tearing open black bags near primary school.',
        ai_summary: 'Uncollected public garbage accumulation near school creating hygiene risk.',
        category: 'sanitation',
        subcategory: 'garbage',
        severity: 3,
        priority_score: 3.1,
        priority_label: 'medium',
        confidence_score: 0.91,
        language: 'en',
        location_text: 'Near Malleshwaram 8th Cross, Bengaluru',
        latitude: 13.005,
        longitude: 77.569,
        citizen_name: 'Rajesh Kumar',
        citizen_contact: 'rajesh.kumar@example.com',
        image_url: null,
        source_channel: 'web',
        status: 'open',
        department_id: '22222222-2222-2222-2222-222222222222',
        department_name: 'Bengaluru pilot sanitation queue',
        duplicate_of: null,
        duplicate_count: 0,
        requires_human_review: false,
        review_status: 'none',
        sla_due_at: new Date(Date.now() + 12 * 3600 * 1000).toISOString(),
        sla_breached: false,
        escalation_level: 0,
        escalated_at: null,
        created_at: new Date(Date.now() - 3 * 3600 * 1000).toISOString(),
        updated_at: new Date(Date.now() - 3 * 3600 * 1000).toISOString(),
        resolved_at: null,
        resolution_notes: null,
        resolution_evidence_url: null,
        citizen_rating: null,
        citizen_feedback: null,
        idempotency_key: 'seed-key-1002',
      },
      {
        id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
        ticket_number: 'CP-2026-01003',
        description:
          'Major municipal water supply pipeline fractured under pavement. Water is gushing onto the street and flooding neighboring basements.',
        ai_summary: 'Underground high-pressure water pipe burst flooding road and residential basements.',
        category: 'water_supply',
        subcategory: 'pipeline_burst',
        severity: 5,
        priority_score: 4.95,
        priority_label: 'critical',
        confidence_score: 0.97,
        language: 'en',
        location_text: 'Near Indiranagar 100 Feet Road, Bengaluru',
        latitude: 12.971,
        longitude: 77.641,
        citizen_name: 'Vikram Mehta',
        citizen_contact: '+91-9811223344',
        image_url: 'https://images.unsplash.com/photo-1541888946425-d0fbb18086f6?w=800',
        source_channel: 'web',
        status: 'in_progress',
        department_id: '33333333-3333-3333-3333-333333333333',
        department_name: 'Bengaluru pilot water review',
        duplicate_of: null,
        duplicate_count: 0,
        requires_human_review: false,
        review_status: 'none',
        sla_due_at: new Date(Date.now() + 4 * 3600 * 1000).toISOString(),
        sla_breached: false,
        escalation_level: 0,
        escalated_at: null,
        created_at: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
        updated_at: new Date(Date.now() - 1 * 3600 * 1000).toISOString(),
        resolved_at: null,
        resolution_notes: null,
        resolution_evidence_url: null,
        citizen_rating: null,
        citizen_feedback: null,
        idempotency_key: 'seed-key-1003',
      },
      {
        id: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
        ticket_number: 'CP-2026-01004',
        description:
          'Something strange is buzzing loudly on the pole near the tea stall. Could be a bee hive or a wire, not completely sure.',
        ai_summary: 'Audible buzzing sound near electric pole, ambiguous source needs safety verification.',
        category: 'electrical',
        subcategory: 'unknown',
        severity: 2,
        priority_score: 2.5,
        priority_label: 'low',
        confidence_score: 0.54,
        language: 'en',
        location_text: 'Near Shivajinagar bus stand, Bengaluru',
        latitude: 12.985,
        longitude: 77.605,
        citizen_name: 'Manoj Tiwari',
        citizen_contact: null,
        image_url: null,
        source_channel: 'web',
        status: 'pending_review',
        department_id: '44444444-4444-4444-4444-444444444444',
        department_name: 'Bengaluru pilot streetlight queue',
        duplicate_of: null,
        duplicate_count: 0,
        requires_human_review: true,
        review_status: 'pending',
        sla_due_at: new Date(Date.now() + 18 * 3600 * 1000).toISOString(),
        sla_breached: false,
        escalation_level: 0,
        escalated_at: null,
        created_at: new Date(Date.now() - 1 * 3600 * 1000).toISOString(),
        updated_at: new Date(Date.now() - 1 * 3600 * 1000).toISOString(),
        resolved_at: null,
        resolution_notes: null,
        resolution_evidence_url: null,
        citizen_rating: null,
        citizen_feedback: null,
        idempotency_key: 'seed-key-1004',
      },
      {
        id: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
        ticket_number: 'CP-2026-01005',
        description:
          'All five sodium street lamps on the flyover descent are non-functional. Completely dark at night, high risk of highway collisions.',
        ai_summary: 'Complete blackout of street lights across 200m section of flyover descent.',
        category: 'electrical',
        subcategory: 'streetlights',
        severity: 4,
        priority_score: 4.5,
        priority_label: 'high',
        confidence_score: 0.95,
        language: 'en',
        location_text: 'Near Hebbal flyover, Bengaluru',
        latitude: 13.035,
        longitude: 77.598,
        citizen_name: 'Pooja Nair',
        citizen_contact: 'pooja.nair@example.com',
        image_url: null,
        source_channel: 'web',
        status: 'open',
        department_id: '44444444-4444-4444-4444-444444444444',
        department_name: 'Bengaluru pilot streetlight queue',
        duplicate_of: null,
        duplicate_count: 0,
        requires_human_review: false,
        review_status: 'none',
        sla_due_at: new Date(Date.now() - 5 * 3600 * 1000).toISOString(),
        sla_breached: true,
        escalation_level: 0,
        escalated_at: null,
        created_at: new Date(Date.now() - 23 * 3600 * 1000).toISOString(),
        updated_at: new Date(Date.now() - 5 * 3600 * 1000).toISOString(),
        resolved_at: null,
        resolution_notes: null,
        resolution_evidence_url: null,
        citizen_rating: null,
        citizen_feedback: null,
        idempotency_key: 'seed-key-1005',
      },
      {
        id: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
        ticket_number: 'CP-2026-01000',
        description:
          'Open sewer manhole cover broken on pedestrian walking path. Urgent risk for children.',
        ai_summary: 'Broken pedestrian manhole cover posing hazardous open drop.',
        category: 'water_supply',
        subcategory: 'sewage',
        severity: 5,
        priority_score: 4.8,
        priority_label: 'critical',
        confidence_score: 0.98,
        language: 'en',
        location_text: 'Near Basavanagudi community centre, Bengaluru',
        latitude: 12.942,
        longitude: 77.569,
        citizen_name: 'Sunil Verma',
        citizen_contact: '+91-9988776655',
        image_url: null,
        source_channel: 'web',
        status: 'resolved',
        department_id: '33333333-3333-3333-3333-333333333333',
        department_name: 'Bengaluru pilot water review',
        duplicate_of: null,
        duplicate_count: 0,
        requires_human_review: false,
        review_status: 'none',
        sla_due_at: new Date(Date.now() - 10 * 3600 * 1000).toISOString(),
        sla_breached: false,
        escalation_level: 0,
        escalated_at: null,
        created_at: new Date(Date.now() - 26 * 3600 * 1000).toISOString(),
        updated_at: new Date(Date.now() - 8 * 3600 * 1000).toISOString(),
        resolved_at: new Date(Date.now() - 8 * 3600 * 1000).toISOString(),
        resolution_notes: 'Heavy-duty ductile iron reinforced manhole cover replaced and sealed by quick response crew.',
        resolution_evidence_url: 'https://images.unsplash.com/photo-1584467735871-8e85353a8413?w=800',
        citizen_rating: 5,
        citizen_feedback: 'Repaired within 18 hours! Excellent and safe work.',
        idempotency_key: 'seed-key-1000',
      },
    ];

    this.events = [
      {
        id: 'evt-1',
        complaint_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        event_type: 'intake',
        actor: 'CivicPilot AI Intake',
        description: 'Complaint ingested from web portal and triaged to Roads & Infrastructure',
        previous_state: null,
        new_state: { status: 'open', category: 'roads' },
        created_at: new Date(Date.now() - 6 * 3600 * 1000).toISOString(),
      },
      {
        id: 'evt-2',
        complaint_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        event_type: 'assignment',
        actor: 'Routing Engine',
        description: 'Assigned priority HIGH (Score: 4.20) with 48h SLA deadline',
        previous_state: { status: 'open' },
        new_state: { status: 'in_progress', department: 'Roads & Infrastructure' },
        created_at: new Date(Date.now() - 5.8 * 3600 * 1000).toISOString(),
      },
      {
        id: 'evt-3',
        complaint_id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
        event_type: 'intake',
        actor: 'CivicPilot AI Intake',
        description: 'Critical public water hazard detected. Immediate emergency dispatch flag raised.',
        created_at: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
      },
      {
        id: 'evt-4',
        complaint_id: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
        event_type: 'intake',
        actor: 'CivicPilot AI Intake',
        description: 'Low confidence classification (0.540). Queued for Human Review.',
        created_at: new Date(Date.now() - 1 * 3600 * 1000).toISOString(),
      },
      {
        id: 'evt-5',
        complaint_id: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
        event_type: 'escalation',
        actor: 'SLA Watchdog Worker',
        description: 'SLA deadline exceeded by 5 hours. Escalated to Tier 1 supervisor.',
        created_at: new Date(Date.now() - 5 * 3600 * 1000).toISOString(),
      },
      {
        id: 'evt-6',
        complaint_id: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
        event_type: 'resolution',
        actor: 'Senior Inspector Verma',
        description: 'Replaced broken manhole cover with certified heavy-duty ductile iron frame.',
        created_at: new Date(Date.now() - 8 * 3600 * 1000).toISOString(),
      },
      {
        id: 'evt-7',
        complaint_id: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
        event_type: 'feedback',
        actor: 'Citizen Sunil Verma',
        description: 'Citizen provided 5-star rating: "Repaired within 18 hours! Excellent and safe work."',
        created_at: new Date(Date.now() - 7.5 * 3600 * 1000).toISOString(),
      },
    ];

    this.aiDecisions = [
      {
        id: 'ai-dec-1',
        complaint_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        model_name: 'gemini-3.6-flash',
        decision_type: 'triage',
        raw_input: 'Large deep pothole right outside Government Engineering College...',
        structured_output: {
          category: 'roads',
          subcategory: 'pothole',
          severity: 4,
          confidence: 0.94,
          safety_flags: ['traffic_hazard', 'motorcycle_risk'],
          summary: 'Deep dangerous pothole outside college gate causing recurring motorcycle skids.',
        },
        confidence: 0.94,
        execution_time_ms: 412,
        reasoning_summary: 'Road damage on high-traffic artery with recorded skid incidents.',
        created_at: new Date(Date.now() - 6 * 3600 * 1000).toISOString(),
      },
    ];

    this.notifications = [
      {
        id: 'notif-1',
        complaint_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        recipient: '+91-9876543210',
        channel: 'sms',
        message_type: 'ticket_received',
        subject: 'CivicPilot Ticket Generated',
        body: 'Your complaint regarding pothole near college gate has been registered as CP-2026-01001.',
        status: 'simulated',
        failure_reason: 'Simulated dispatch in demo mode (external provider not configured)',
        delivered_at: null,
        created_at: new Date(Date.now() - 6 * 3600 * 1000).toISOString(),
      },
    ];
  }
}

// Global singleton memory store across HMR in Node.js
const globalStore =
  (global as unknown as { __civicpilotStore?: MemoryDataStore }).__civicpilotStore || new MemoryDataStore();
if (process.env.NODE_ENV !== 'production') {
  (global as unknown as { __civicpilotStore?: MemoryDataStore }).__civicpilotStore = globalStore;
}

export class StorageService {
  public static async resetAndSeed(): Promise<{ mode: 'supabase' | 'demo'; description: string; reset: boolean }> {
    if (process.env.DEMO_MODE !== 'true') {
      if (!isSupabaseConfigured()) {
        throw new Error('Database configuration error: Persistent database credentials are not configured.');
      }
      return {
        mode: 'supabase',
        description: 'Persistent Supabase mode active. Ephemeral in-memory reset is disabled in production; schema and benchmark records are maintained via SQL migrations.',
        reset: false,
      };
    }
    // Non-durable demo mode reset
    globalStore.seedDefaults();
    return {
      mode: 'demo',
      description: 'Non-durable demo memory store reset and re-seeded with benchmark civic complaints.',
      reset: true,
    };
  }

  public static isDurable(): boolean {
    return isSupabaseMode();
  }

  public static isDemoMode(): boolean {
    return process.env.DEMO_MODE === 'true' || !isSupabaseConfigured();
  }

  public static getStorageModeInfo(): {
    mode: 'supabase' | 'demo';
    isDurable: boolean;
    description: string;
  } {
    if (isSupabaseMode()) {
      return {
        mode: 'supabase',
        isDurable: true,
        description: 'Durable persistent storage connected via Supabase PostgreSQL.',
      };
    }
    return {
      mode: 'demo',
      isDurable: false,
      description: 'Non-durable in-memory storage (DEMO_MODE). State resets on server restart.',
    };
  }

  public static async getDepartments(): Promise<Department[]> {
    if (isSupabaseMode()) {
      const supabase = getServerSupabase();
      if (!supabase) {
        throw new Error('Database error: Supabase client unavailable');
      }
      const { data, error } = await supabase.from('departments').select('*').eq('active', true);
      if (error) {
        console.error('[Supabase Storage] getDepartments error:', error.message);
        throw new Error('Database error: Failed to fetch departments');
      }
      return (data || []) as Department[];
    }

    assertStorageReady();
    return globalStore.departments;
  }

  public static async getDepartmentById(id: string): Promise<Department | undefined> {
    if (isSupabaseMode()) {
      const supabase = getServerSupabase();
      if (!supabase) {
        throw new Error('Database error: Supabase client unavailable');
      }
      const { data, error } = await supabase.from('departments').select('*').eq('id', id).maybeSingle();
      if (error) {
        console.error('[Supabase Storage] getDepartmentById error:', error.message);
        throw new Error('Database error: Failed to fetch department');
      }
      return (data as Department) || undefined;
    }

    assertStorageReady();
    return globalStore.departments.find((d) => d.id === id);
  }

  public static async createComplaint(
    data: Omit<Complaint, 'id' | 'ticket_number' | 'created_at' | 'updated_at'>,
    customId?: string
  ): Promise<Complaint> {
    const id = customId || crypto.randomUUID();
    const now = new Date().toISOString();

    if (isSupabaseMode()) {
      const supabase = getServerSupabase();
      if (!supabase) {
        throw new Error('Database error: Supabase client unavailable');
      }

      // Check idempotency in persistent database
      if (data.idempotency_key) {
        const { data: existing, error: idemErr } = await supabase
          .from('complaints')
          .select('*')
          .eq('idempotency_key', data.idempotency_key)
          .maybeSingle();

        if (idemErr) {
          console.error('[Supabase Storage] Idempotency query error:', idemErr.message);
          throw new Error('Database error: Failed to check idempotency key');
        }

        if (existing) {
          const existingDepartment = existing.department_id
            ? await this.getDepartmentById(existing.department_id)
            : undefined;
          return { ...existing, department_name: existingDepartment?.name || 'Bengaluru pilot jurisdiction review' } as Complaint;
        }
      }

      // Atomic Ticket Number Generation via Supabase RPC or Fallback Sequence
      let ticketNumber = '';
      try {
        const { data: generatedNumber, error: rpcErr } = await supabase.rpc('generate_ticket_number');
        if (!rpcErr && generatedNumber) {
          ticketNumber = String(generatedNumber);
        }
      } catch {
        ticketNumber = '';
      }

      if (!ticketNumber) {
        // Fallback atomic ticket number generator
        const year = new Date().getFullYear();
        const rand = Math.floor(10000 + Math.random() * 90000);
        ticketNumber = `CP-${year}-${rand}`;
      }

      const department = data.department_id ? await this.getDepartmentById(data.department_id) : undefined;

      const recordToInsert: Complaint = {
        ...data,
        id,
        ticket_number: ticketNumber,
        department_name: department?.name || 'Bengaluru pilot jurisdiction review',
        created_at: now,
        updated_at: now,
      };
      // The display name is derived from departments; it is not a complaints column.
      delete recordToInsert.department_name;

      const { data: inserted, error: insertErr } = await supabase
        .from('complaints')
        .insert([recordToInsert])
        .select()
        .single();

      if (insertErr || !inserted) {
        // Concurrency & Idempotency: If concurrent request inserted the same idempotency_key (code 23505), return existing
        if (
          data.idempotency_key &&
          (insertErr?.code === '23505' ||
            insertErr?.message?.toLowerCase().includes('idempotency_key') ||
            insertErr?.message?.toLowerCase().includes('duplicate key'))
        ) {
          const { data: existingAfterConflict } = await supabase
            .from('complaints')
            .select('*')
            .eq('idempotency_key', data.idempotency_key)
            .maybeSingle();

          if (existingAfterConflict) {
            return { ...existingAfterConflict, department_name: department?.name || 'Bengaluru pilot jurisdiction review' } as Complaint;
          }
        }

        console.error('[Supabase Storage] Insert complaint error:', insertErr?.message);
        throw new Error('Database error: Failed to persist complaint record');
      }

      // Record Intake Event in database
      await this.addComplaintEvent({
        complaint_id: id,
        event_type: 'intake',
        actor: 'CivicPilot AI Intake',
        description: `Ticket ${ticketNumber} registered and triaged (${inserted.category} - ${inserted.priority_label})`,
        new_state: { status: inserted.status, priority: inserted.priority_label },
      });

      return { ...inserted, department_name: department?.name || 'Bengaluru pilot jurisdiction review' } as Complaint;
    }

    // Demo Mode In-Memory Store
    assertStorageReady();

    if (data.idempotency_key) {
      const existing = globalStore.complaints.find((c) => c.idempotency_key === data.idempotency_key);
      if (existing) {
        return existing;
      }
    }

    const ticketNumber = globalStore.nextTicketNumber();
    const department = data.department_id ? await this.getDepartmentById(data.department_id) : undefined;

    // Check again after async department lookup to handle race conditions
    if (data.idempotency_key) {
      const concurrentMatch = globalStore.complaints.find((c) => c.idempotency_key === data.idempotency_key);
      if (concurrentMatch) {
        return concurrentMatch;
      }
    }

    const newComplaint: Complaint = {
      ...data,
      id,
      ticket_number: ticketNumber,
      department_name: department?.name || 'Ombudsman / Triage Fallback',
      created_at: now,
      updated_at: now,
    };

    globalStore.complaints.unshift(newComplaint);

    await this.addComplaintEvent({
      complaint_id: id,
      event_type: 'intake',
      actor: 'CivicPilot AI Intake',
      description: `Ticket ${ticketNumber} registered and triaged (${newComplaint.category} - ${newComplaint.priority_label})`,
      new_state: { status: newComplaint.status, priority: newComplaint.priority_label },
    });

    return newComplaint;
  }

  public static async getComplaints(filters: ComplaintFilters = {}): Promise<{
    data: Complaint[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const page = filters.page && filters.page > 0 ? filters.page : 1;
    const limit = filters.limit && filters.limit > 0 ? filters.limit : 20;

    if (isSupabaseMode()) {
      const supabase = getServerSupabase();
      if (!supabase) {
        throw new Error('Database error: Supabase client unavailable');
      }

      let query = supabase.from('complaints').select('*', { count: 'exact' });

      if (filters.status) query = query.eq('status', filters.status);
      if (filters.category) query = query.eq('category', filters.category);
      if (filters.priority) query = query.eq('priority_label', filters.priority);
      if (filters.department_id) query = query.eq('department_id', filters.department_id);
      if (filters.requires_human_review !== undefined) {
        query = query.eq('requires_human_review', filters.requires_human_review);
      }
      if (filters.is_duplicate !== undefined) {
        query = filters.is_duplicate ? query.not('duplicate_of', 'is', null) : query.is('duplicate_of', null);
      }
      if (filters.search && filters.search.trim()) {
        const q = filters.search.trim();
        query = query.or(
          `ticket_number.ilike.%${q}%,description.ilike.%${q}%,location_text.ilike.%${q}%,citizen_name.ilike.%${q}%,ai_summary.ilike.%${q}%`
        );
      }

      query = query.order('created_at', { ascending: false });

      const startIndex = (page - 1) * limit;
      query = query.range(startIndex, startIndex + limit - 1);

      const { data, count, error } = await query;
      if (error) {
        console.error('[Supabase Storage] getComplaints error:', error.message);
        throw new Error('Database error: Failed to query complaints');
      }

      const total = count || 0;
      const departmentNames = new Map(
        ((data?.length || 0) > 0 ? await this.getDepartments() : []).map((department) => [department.id, department.name])
      );
      return {
        data: (data || []).map((row) => ({
          ...row,
          department_name: departmentNames.get(row.department_id) || 'Bengaluru pilot jurisdiction review',
        })) as Complaint[],
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      };
    }

    // Demo Mode In-Memory Store
    assertStorageReady();

    let items = [...globalStore.complaints];

    if (filters.status) {
      items = items.filter((c) => c.status === filters.status);
    }
    if (filters.category) {
      items = items.filter((c) => c.category === filters.category);
    }
    if (filters.priority) {
      items = items.filter((c) => c.priority_label === filters.priority);
    }
    if (filters.department_id) {
      items = items.filter((c) => c.department_id === filters.department_id);
    }
    if (filters.requires_human_review !== undefined) {
      items = items.filter((c) => c.requires_human_review === filters.requires_human_review);
    }
    if (filters.is_duplicate !== undefined) {
      items = items.filter((c) => (filters.is_duplicate ? Boolean(c.duplicate_of) : !c.duplicate_of));
    }
    if (filters.search && filters.search.trim() !== '') {
      const q = filters.search.toLowerCase().trim();
      items = items.filter(
        (c) =>
          c.ticket_number.toLowerCase().includes(q) ||
          c.description.toLowerCase().includes(q) ||
          c.ai_summary.toLowerCase().includes(q) ||
          c.location_text.toLowerCase().includes(q) ||
          (c.citizen_name && c.citizen_name.toLowerCase().includes(q))
      );
    }

    items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    const total = items.length;
    const totalPages = Math.ceil(total / limit) || 1;
    const startIndex = (page - 1) * limit;
    const paginated = items.slice(startIndex, startIndex + limit);

    return {
      data: paginated,
      total,
      page,
      limit,
      totalPages,
    };
  }

  public static async getComplaintById(idOrTicket: string): Promise<Complaint | undefined> {
    if (isSupabaseMode()) {
      const supabase = getServerSupabase();
      if (!supabase) {
        throw new Error('Database error: Supabase client unavailable');
      }

      let query = supabase.from('complaints').select('*');
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrTicket)) {
        query = query.eq('id', idOrTicket);
      } else {
        query = query.eq('ticket_number', idOrTicket);
      }

      const { data, error } = await query.maybeSingle();
      if (error) {
        console.error('[Supabase Storage] getComplaintById error:', error.message);
        throw new Error('Database error: Failed to fetch complaint by identifier');
      }

      if (!data) return undefined;
      const department = data.department_id ? await this.getDepartmentById(data.department_id) : undefined;
      return { ...data, department_name: department?.name || 'Bengaluru pilot jurisdiction review' } as Complaint;
    }

    assertStorageReady();
    return globalStore.complaints.find(
      (c) => c.id === idOrTicket || c.ticket_number.toLowerCase() === idOrTicket.toLowerCase()
    );
  }

  public static async updateComplaint(id: string, updates: Partial<Complaint>): Promise<Complaint | undefined> {
    if (isSupabaseMode()) {
      const supabase = getServerSupabase();
      if (!supabase) {
        throw new Error('Database error: Supabase client unavailable');
      }

      const patchData = {
        ...updates,
        updated_at: new Date().toISOString(),
      };
      delete patchData.department_name;

      const { data, error } = await supabase.from('complaints').update(patchData).eq('id', id).select().single();

      if (error || !data) {
        console.error('[Supabase Storage] updateComplaint error:', error?.message);
        throw new Error('Database error: Failed to update complaint');
      }

      const department = data.department_id ? await this.getDepartmentById(data.department_id) : undefined;
      return { ...data, department_name: department?.name || 'Bengaluru pilot jurisdiction review' } as Complaint;
    }

    assertStorageReady();
    const index = globalStore.complaints.findIndex((c) => c.id === id);
    if (index === -1) return undefined;

    const current = globalStore.complaints[index];
    const updated: Complaint = {
      ...current,
      ...updates,
      updated_at: new Date().toISOString(),
    };

    if (updates.department_id && updates.department_id !== current.department_id) {
      const dept = await this.getDepartmentById(updates.department_id);
      if (dept) updated.department_name = dept.name;
    }

    globalStore.complaints[index] = updated;
    return updated;
  }

  public static async addComplaintEvent(
    eventData: Omit<ComplaintEvent, 'id' | 'created_at'>
  ): Promise<ComplaintEvent> {
    const newEvent: ComplaintEvent = {
      ...eventData,
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
    };

    if (isSupabaseMode()) {
      const supabase = getServerSupabase();
      if (!supabase) {
        throw new Error('Database error: Supabase client unavailable');
      }

      const { data, error } = await supabase.from('complaint_events').insert([newEvent]).select().single();
      if (error || !data) {
        console.error('[Supabase Storage] addComplaintEvent error:', error?.message);
        throw new Error('Database error: Failed to record complaint event');
      }
      return data as ComplaintEvent;
    }

    assertStorageReady();
    globalStore.events.unshift(newEvent);
    return newEvent;
  }

  public static async getComplaintEvents(complaintId: string): Promise<ComplaintEvent[]> {
    if (isSupabaseMode()) {
      const supabase = getServerSupabase();
      if (!supabase) {
        throw new Error('Database error: Supabase client unavailable');
      }

      const { data, error } = await supabase
        .from('complaint_events')
        .select('*')
        .eq('complaint_id', complaintId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[Supabase Storage] getComplaintEvents error:', error.message);
        throw new Error('Database error: Failed to fetch complaint events');
      }
      return (data || []) as ComplaintEvent[];
    }

    assertStorageReady();
    return globalStore.events
      .filter((e) => e.complaint_id === complaintId)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  public static async getAllEvents(limit: number = 50): Promise<ComplaintEvent[]> {
    if (isSupabaseMode()) {
      const supabase = getServerSupabase();
      if (!supabase) {
        throw new Error('Database error: Supabase client unavailable');
      }

      const { data, error } = await supabase
        .from('complaint_events')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        console.error('[Supabase Storage] getAllEvents error:', error.message);
        throw new Error('Database error: Failed to fetch event audit log');
      }
      return (data || []) as ComplaintEvent[];
    }

    assertStorageReady();
    return globalStore.events.slice(0, limit);
  }

  public static async addAiDecision(
    decision: Omit<AiDecision, 'id' | 'created_at'>
  ): Promise<AiDecision> {
    const newDecision: AiDecision = {
      ...decision,
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
    };

    if (isSupabaseMode()) {
      const supabase = getServerSupabase();
      if (!supabase) {
        throw new Error('Database error: Supabase client unavailable');
      }

      const { data, error } = await supabase.from('ai_decisions').insert([newDecision]).select().single();
      if (error || !data) {
        console.error('[Supabase Storage] addAiDecision error:', error?.message);
        throw new Error('Database error: Failed to log AI decision');
      }
      return data as AiDecision;
    }

    assertStorageReady();
    globalStore.aiDecisions.unshift(newDecision);
    return newDecision;
  }

  public static async getAiDecisions(complaintId: string): Promise<AiDecision[]> {
    if (isSupabaseMode()) {
      const supabase = getServerSupabase();
      if (!supabase) {
        throw new Error('Database error: Supabase client unavailable');
      }

      const { data, error } = await supabase
        .from('ai_decisions')
        .select('*')
        .eq('complaint_id', complaintId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[Supabase Storage] getAiDecisions error:', error.message);
        throw new Error('Database error: Failed to query AI decisions');
      }
      return (data || []) as AiDecision[];
    }

    assertStorageReady();
    return globalStore.aiDecisions.filter((d) => d.complaint_id === complaintId);
  }

  public static async addReviewAction(
    action: Omit<ReviewAction, 'id' | 'created_at'>
  ): Promise<ReviewAction> {
    const newAction: ReviewAction = {
      ...action,
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
    };

    if (isSupabaseMode()) {
      const supabase = getServerSupabase();
      if (!supabase) {
        throw new Error('Database error: Supabase client unavailable');
      }

      const { data, error } = await supabase.from('review_actions').insert([newAction]).select().single();
      if (error || !data) {
        console.error('[Supabase Storage] addReviewAction error:', error?.message);
        throw new Error('Database error: Failed to record human review action');
      }
      return data as ReviewAction;
    }

    assertStorageReady();
    globalStore.reviewActions.unshift(newAction);
    return newAction;
  }

  public static async getReviewActions(complaintId: string): Promise<ReviewAction[]> {
    if (isSupabaseMode()) {
      const supabase = getServerSupabase();
      if (!supabase) {
        throw new Error('Database error: Supabase client unavailable');
      }

      const { data, error } = await supabase
        .from('review_actions')
        .select('*')
        .eq('complaint_id', complaintId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[Supabase Storage] getReviewActions error:', error.message);
        throw new Error('Database error: Failed to fetch review actions');
      }
      return (data || []) as ReviewAction[];
    }

    assertStorageReady();
    return globalStore.reviewActions.filter((r) => r.complaint_id === complaintId);
  }

  public static async addNotification(
    notif: Omit<NotificationRecord, 'id' | 'created_at'>
  ): Promise<NotificationRecord> {
    const newNotif: NotificationRecord = {
      ...notif,
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
    };

    if (isSupabaseMode()) {
      const supabase = getServerSupabase();
      if (!supabase) {
        throw new Error('Database error: Supabase client unavailable');
      }

      const { data, error } = await supabase.from('notifications').insert([newNotif]).select().single();
      if (error || !data) {
        console.error('[Supabase Storage] addNotification error:', error?.message);
        throw new Error('Database error: Failed to persist notification record');
      }
      return data as NotificationRecord;
    }

    assertStorageReady();
    globalStore.notifications.unshift(newNotif);
    return newNotif;
  }

  public static async getNotifications(complaintId?: string): Promise<NotificationRecord[]> {
    if (isSupabaseMode()) {
      const supabase = getServerSupabase();
      if (!supabase) {
        throw new Error('Database error: Supabase client unavailable');
      }

      let query = supabase.from('notifications').select('*').order('created_at', { ascending: false });
      if (complaintId) {
        query = query.eq('complaint_id', complaintId);
      }

      const { data, error } = await query;
      if (error) {
        console.error('[Supabase Storage] getNotifications error:', error.message);
        throw new Error('Database error: Failed to fetch notifications');
      }
      return (data || []) as NotificationRecord[];
    }

    assertStorageReady();
    if (complaintId) {
      return globalStore.notifications.filter((n) => n.complaint_id === complaintId);
    }
    return globalStore.notifications;
  }

  public static async getAnalytics() {
    let complaints: Complaint[] = [];
    let events: ComplaintEvent[] = [];
    let departments: Department[] = [];

    if (isSupabaseMode()) {
      const supabase = getServerSupabase();
      if (!supabase) {
        throw new Error('Database error: Supabase client unavailable');
      }

      const [complaintsRes, eventsRes, deptsRes] = await Promise.all([
        supabase.from('complaints').select('*').order('created_at', { ascending: false }),
        supabase.from('complaint_events').select('*').order('created_at', { ascending: false }),
        supabase.from('departments').select('*').eq('active', true),
      ]);

      if (complaintsRes.error || eventsRes.error || deptsRes.error) {
        console.error('[Supabase Storage] Analytics query error');
        throw new Error('Database error: Failed to aggregate analytics metrics');
      }

      complaints = (complaintsRes.data || []) as Complaint[];
      events = (eventsRes.data || []) as ComplaintEvent[];
      departments = (deptsRes.data || []) as Department[];
    } else {
      assertStorageReady();
      complaints = globalStore.complaints;
      events = globalStore.events;
      departments = globalStore.departments;
    }

    const now = Date.now();
    const total = complaints.length;
    const open = complaints.filter((c) => c.status === 'open').length;
    const inProgress = complaints.filter((c) => c.status === 'in_progress').length;
    const pendingReview = complaints.filter((c) => c.status === 'pending_review').length;
    const resolved = complaints.filter((c) => c.status === 'resolved' || c.status === 'closed').length;
    const critical = complaints.filter((c) => c.priority_label === 'critical').length;
    const overdue = complaints.filter((c) => {
      if (c.status === 'resolved' || c.status === 'closed' || c.status === 'rejected') return false;
      return new Date(c.sla_due_at).getTime() < now || c.sla_breached;
    }).length;

    const resolutionRate = total > 0 ? Math.round((resolved / total) * 100) : 0;

    let responseTimeSumMinutes = 0;
    let responseCount = 0;

    complaints.forEach((c) => {
      const createdTime = new Date(c.created_at).getTime();
      const firstAssignEvent = events.find(
        (e) => e.complaint_id === c.id && (e.event_type === 'assignment' || e.event_type === 'status_change')
      );
      if (firstAssignEvent) {
        const assignedTime = new Date(firstAssignEvent.created_at).getTime();
        const diffMinutes = Math.max(1, Math.round((assignedTime - createdTime) / (1000 * 60)));
        responseTimeSumMinutes += diffMinutes;
        responseCount += 1;
      }
    });

    const avgFirstResponseMinutes = responseCount > 0 ? Math.round(responseTimeSumMinutes / responseCount) : null;

    const priorityDistribution = {
      low: complaints.filter((c) => c.priority_label === 'low').length,
      medium: complaints.filter((c) => c.priority_label === 'medium').length,
      high: complaints.filter((c) => c.priority_label === 'high').length,
      critical: complaints.filter((c) => c.priority_label === 'critical').length,
    };

    const categoryCounts: Record<string, number> = {};
    complaints.forEach((c) => {
      categoryCounts[c.category] = (categoryCounts[c.category] || 0) + 1;
    });

    const departmentWorkload: Record<string, { total: number; open: number; in_progress: number; resolved: number }> = {};
    departments.forEach((dept) => {
      departmentWorkload[dept.name] = { total: 0, open: 0, in_progress: 0, resolved: 0 };
    });

    complaints.forEach((c) => {
      const deptName = departments.find((department) => department.id === c.department_id)?.name || c.department_name || 'Unassigned';
      if (!departmentWorkload[deptName]) {
        departmentWorkload[deptName] = { total: 0, open: 0, in_progress: 0, resolved: 0 };
      }
      departmentWorkload[deptName].total += 1;
      if (c.status === 'open') departmentWorkload[deptName].open += 1;
      if (c.status === 'in_progress') departmentWorkload[deptName].in_progress += 1;
      if (c.status === 'resolved' || c.status === 'closed') departmentWorkload[deptName].resolved += 1;
    });

    const confidenceBands = {
      high: complaints.filter((c) => c.confidence_score >= 0.85).length,
      moderate: complaints.filter((c) => c.confidence_score >= 0.7 && c.confidence_score < 0.85).length,
      low_needs_review: complaints.filter((c) => c.confidence_score < 0.7).length,
    };

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const trends = Array.from({ length: 7 }, (_, offset) => {
      const dayStart = new Date(today.getTime() - (6 - offset) * 24 * 3600_000);
      const dayEnd = dayStart.getTime() + 24 * 3600_000;
      return {
        day: dayStart.toLocaleDateString('en-IN', { month: 'short', day: 'numeric', timeZone: 'UTC' }),
        submitted: complaints.filter((c) => {
          const created = Date.parse(c.created_at);
          return created >= dayStart.getTime() && created < dayEnd;
        }).length,
        resolved: complaints.filter((c) => {
          const resolvedAt = c.resolved_at ? Date.parse(c.resolved_at) : NaN;
          return resolvedAt >= dayStart.getTime() && resolvedAt < dayEnd;
        }).length,
      };
    });

    const duplicateCount = complaints.filter((c) => Boolean(c.duplicate_of)).length;
    const escalationCount = complaints.filter((c) => c.escalation_level > 0 || c.status === 'escalated').length;

    return {
      summary: {
        total,
        open,
        inProgress,
        pendingReview,
        resolved,
        critical,
        overdue,
        avgFirstResponseMinutes,
        resolutionRate,
        duplicateCount,
        escalationCount,
      },
      priorityDistribution,
      categoryCounts,
      departmentWorkload,
      confidenceBands,
      trends,
    };
  }
}
