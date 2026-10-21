import crypto from 'crypto';

const demoCapabilitySecret = crypto.randomBytes(32).toString('hex');

/**
 * Constant-time string comparison to prevent timing attacks on sensitive secrets.
 */
export function constantTimeCompare(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Generates an HMAC capability token for a specific ticket or resource.
 * Citizens can use this token to authorize feedback without needing an account.
 */
export function generateFeedbackToken(complaintId: string): string {
  const secret =
    process.env.FEEDBACK_SECRET_KEY ||
    (process.env.DEMO_MODE === 'true' ? demoCapabilitySecret : undefined);
  if (!secret) throw new Error('FEEDBACK_SECRET_KEY is required for citizen feedback.');
  return crypto.createHmac('sha256', secret).update(`feedback:${complaintId}`).digest('hex');
}

/**
 * Verifies a feedback capability token for a specific complaint ID.
 */
export function verifyFeedbackToken(complaintId: string, providedToken: string | null | undefined): boolean {
  if (!complaintId || !providedToken) return false;
  const expectedToken = generateFeedbackToken(complaintId);
  return constantTimeCompare(providedToken, expectedToken);
}

/** Private bearer code issued with a web receipt; it only opens that ticket. */
export function generateTrackingToken(complaintId: string): string {
  const secret = process.env.FEEDBACK_SECRET_KEY ||
    (process.env.DEMO_MODE === 'true' ? demoCapabilitySecret : undefined);
  if (!secret) throw new Error('FEEDBACK_SECRET_KEY is required for private ticket tracking.');
  return crypto.createHmac('sha256', secret).update(`tracking:${complaintId}`).digest('hex');
}

export function verifyTrackingToken(complaintId: string, providedToken: string | null | undefined): boolean {
  if (!complaintId || !providedToken) return false;
  return constantTimeCompare(providedToken, generateTrackingToken(complaintId));
}

export function isAuthorizedStaff(providedKey: string | null | undefined): boolean {
  return isAuthorizedReviewer(providedKey) || isAuthorizedAdmin(providedKey);
}

/**
 * Helper to check administrative authentication.
 * Returns true if provided header matches ADMIN_API_KEY.
 */
export function isAuthorizedAdmin(providedKey: string | null | undefined): boolean {
  const adminKey = process.env.ADMIN_API_KEY;
  if (!adminKey || !providedKey) return false;
  return constantTimeCompare(providedKey, adminKey);
}

/**
 * Helper to check reviewer authentication.
 * Returns true if provided header matches REVIEWER_SECRET_KEY.
 */
export function isAuthorizedReviewer(providedKey: string | null | undefined): boolean {
  const reviewerKey = process.env.REVIEWER_SECRET_KEY;
  if (!reviewerKey || !providedKey) return false;
  return constantTimeCompare(providedKey, reviewerKey);
}

/**
 * Helper to check webhook authentication shared secret (supports N8N_WEBHOOK_SECRET and WEBHOOK_SHARED_SECRET).
 */
export function isAuthorizedWebhook(providedSecret: string | null | undefined): {
  configured: boolean;
  authorized: boolean;
} {
  const secret = process.env.N8N_WEBHOOK_SECRET || process.env.WEBHOOK_SHARED_SECRET;
  if (!secret) {
    return { configured: false, authorized: false };
  }
  if (!providedSecret) {
    return { configured: true, authorized: false };
  }
  return { configured: true, authorized: constantTimeCompare(providedSecret, secret) };
}
