import { StorageService } from '@/lib/db/storage';
import { Complaint } from '@/types';

export interface GovernmentSyncResult {
  mode: 'simulated' | 'official';
  provider: string;
  official_reference: string | null;
  government_status: string;
}

function open311Configuration() {
  if (process.env.GOVERNMENT_INTEGRATION_ENABLED !== 'true') {
    throw new Error('Government integration has not been enabled by the operator.');
  }
  const base = process.env.OPEN311_BASE_URL;
  const jurisdiction = process.env.OPEN311_JURISDICTION_ID;
  const apiKey = process.env.OPEN311_API_KEY;
  if (!base || !jurisdiction || !apiKey) throw new Error('Open311 partner credentials are incomplete.');
  const url = new URL(base);
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Open311 requires a secure HTTPS endpoint.');
  if (!url.pathname.endsWith('/')) url.pathname += '/';
  const codes = JSON.parse(process.env.OPEN311_SERVICE_CODES || '{}') as Record<string, string>;
  return { url, jurisdiction, apiKey, codes };
}

function firstRequest(body: unknown): Record<string, unknown> | null {
  if (Array.isArray(body)) return body[0] && typeof body[0] === 'object' ? body[0] : null;
  if (!body || typeof body !== 'object') return null;
  const object = body as Record<string, unknown>;
  if (Array.isArray(object.service_requests)) return firstRequest(object.service_requests);
  return object;
}

export async function syncGovernmentTicket(complaint: Complaint, operation: 'submit' | 'refresh' = 'submit'): Promise<GovernmentSyncResult> {
  if (complaint.duplicate_of) throw new Error('Only the canonical incident can be sent to a government system.');
  const adapter = process.env.GOVERNMENT_ADAPTER || 'mock';
  if (adapter === 'mock') {
    await StorageService.updateComplaint(complaint.id, {
      government_provider: 'mock', government_status: 'simulated', government_synced_at: new Date().toISOString(),
    });
    await StorageService.addComplaintEvent({
      complaint_id: complaint.id,
      event_type: 'status_change',
      actor: 'CivicPilot Government Adapter',
      description: 'Simulated municipal handoff. No official request was submitted.',
      metadata: { government_mode: 'simulated' },
    });
    return { mode: 'simulated', provider: 'mock', official_reference: null, government_status: 'simulated' };
  }
  if (adapter !== 'open311') throw new Error(`Unsupported government adapter: ${adapter}`);
  const config = open311Configuration();

  if (operation === 'submit' && complaint.official_reference) {
    return { mode: 'official', provider: 'open311', official_reference: complaint.official_reference, government_status: complaint.government_status || 'submitted' };
  }

  let requestUrl: URL;
  let init: RequestInit;
  if (operation === 'refresh') {
    if (!complaint.official_reference) throw new Error('This ticket has no official reference to refresh.');
    requestUrl = new URL(`requests/${encodeURIComponent(complaint.official_reference)}.json`, config.url);
    requestUrl.searchParams.set('jurisdiction_id', config.jurisdiction);
    requestUrl.searchParams.set('api_key', config.apiKey);
    init = { method: 'GET', cache: 'no-store' };
  } else {
    const serviceCode = config.codes[complaint.category];
    if (!serviceCode) throw new Error(`No approved Open311 service code for ${complaint.category}.`);
    requestUrl = new URL('requests.json', config.url);
    const form = new URLSearchParams({
      jurisdiction_id: config.jurisdiction,
      api_key: config.apiKey,
      service_code: serviceCode,
      description: complaint.description.slice(0, 4000),
    });
    if (complaint.latitude != null && complaint.longitude != null) {
      form.set('lat', String(complaint.latitude));
      form.set('long', String(complaint.longitude));
    } else if (complaint.location_text) {
      form.set('address_string', complaint.location_text);
    } else {
      throw new Error('An approved location is required for official submission.');
    }
    init = { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: form, cache: 'no-store' };
  }

  const response = await fetch(requestUrl, init);
  if (!response.ok) throw new Error(`Open311 partner returned HTTP ${response.status}.`);
  const record = firstRequest(await response.json());
  if (!record) throw new Error('Open311 partner returned an invalid response.');
  const reference = operation === 'refresh' ? complaint.official_reference : String(record.service_request_id || '');
  if (!reference) throw new Error('Open311 partner did not return a service request ID.');
  const status = typeof record.status === 'string' ? record.status : operation === 'submit' ? 'submitted' : 'unknown';
  await StorageService.updateComplaint(complaint.id, {
    government_provider: 'open311', official_reference: reference, government_status: status, government_synced_at: new Date().toISOString(),
  });
  await StorageService.addComplaintEvent({
    complaint_id: complaint.id,
    event_type: 'status_change',
    actor: 'CivicPilot Government Adapter',
    description: operation === 'submit' ? `Official service request ${reference} submitted.` : `Official service request ${reference} status: ${status}.`,
    metadata: { government_mode: 'official', official_reference: reference, government_status: status },
  });
  return { mode: 'official', provider: 'open311', official_reference: reference, government_status: status };
}
