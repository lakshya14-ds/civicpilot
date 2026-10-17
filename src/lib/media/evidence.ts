import { getServerSupabase, hasSupabaseServerKey } from '@/lib/db/supabase';

const BUCKET = 'civic-evidence';
const MAX_BYTES = 5 * 1024 * 1024;
const demoEvidence = new Map<string, { bytes: Uint8Array; contentType: string }>();

export class EvidenceError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

function detectImageType(bytes: Uint8Array): { mime: string; extension: string } | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { mime: 'image/jpeg', extension: 'jpg' };
  }
  if (bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((part, index) => bytes[index] === part)) {
    return { mime: 'image/png', extension: 'png' };
  }
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP') {
    return { mime: 'image/webp', extension: 'webp' };
  }
  return null;
}

export function isEvidenceReference(value: string): boolean {
  return /^evidence:\/\/[a-f0-9-]{36}\.(jpg|png|webp)$/.test(value);
}

export async function saveEvidence(bytes: Uint8Array): Promise<string> {
  if (bytes.length === 0 || bytes.length > MAX_BYTES) {
    throw new EvidenceError('Photo must be between 1 byte and 5 MB.', 413);
  }
  const type = detectImageType(bytes);
  if (!type) {
    throw new EvidenceError('Only JPEG, PNG, and WebP photos are supported.');
  }

  const key = `${crypto.randomUUID()}.${type.extension}`;
  if (process.env.DEMO_MODE === 'true') {
    demoEvidence.set(key, { bytes, contentType: type.mime });
    return `evidence://${key}`;
  }

  if (!hasSupabaseServerKey()) {
    throw new EvidenceError('Private media storage is not configured.', 503);
  }
  const supabase = getServerSupabase();
  if (!supabase) throw new EvidenceError('Private media storage is unavailable.', 503);
  const { error } = await supabase.storage.from(BUCKET).upload(key, bytes, {
    contentType: type.mime,
    upsert: false,
  });
  if (error) throw new EvidenceError('Photo could not be stored.', 503);
  return `evidence://${key}`;
}

export async function loadDemoEvidence(reference: string) {
  if (process.env.DEMO_MODE !== 'true' || !isEvidenceReference(reference)) return null;
  return demoEvidence.get(reference.slice('evidence://'.length)) || null;
}

export async function createEvidenceSignedUrl(reference: string, expiresIn = 300): Promise<string | null> {
  if (!isEvidenceReference(reference)) return null;
  if (process.env.DEMO_MODE === 'true') {
    const evidence = await loadDemoEvidence(reference);
    return evidence ? `data:${evidence.contentType};base64,${Buffer.from(evidence.bytes).toString('base64')}` : null;
  }
  const supabase = getServerSupabase();
  if (!supabase || !hasSupabaseServerKey()) return null;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(reference.slice('evidence://'.length), expiresIn);
  return error ? null : data.signedUrl;
}
