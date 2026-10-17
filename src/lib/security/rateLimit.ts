/**
 * In-Memory Sliding/Fixed Window Rate Limiter
 * Provides DDoS, brute-force, and spam protection for public API routes.
 *
 * NOTE ON DEPLOYMENT ARCHITECTURE:
 * This rate limiter uses a process-local memory store suitable for single-node /
 * container deployments and hackathon demonstration environments. In a multi-region,
 * multi-container, or distributed serverless deployment, an external shared store
 * (e.g. Upstash Redis / Cloudflare KV) should back this interface.
 */

interface RateLimitRecord {
  count: number;
  resetTime: number;
}

const ipStore = new Map<string, RateLimitRecord>();

// Clean up stale IP records every 5 minutes
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
let lastCleanup = Date.now();

function cleanupStaleRecords(now: number) {
  if (now - lastCleanup > CLEANUP_INTERVAL_MS) {
    lastCleanup = now;
    for (const [key, record] of ipStore.entries()) {
      if (now > record.resetTime) {
        ipStore.delete(key);
      }
    }
  }
}

export interface RateLimitOptions {
  windowMs?: number; // Default 60 seconds
  maxRequests?: number; // Default 30 requests per window
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
  resetTime: number;
}

export function checkRateLimit(
  identifier: string,
  options: RateLimitOptions = {}
): RateLimitResult {
  const windowMs = options.windowMs || 60 * 1000;
  const maxRequests = options.maxRequests || 30;
  const now = Date.now();

  cleanupStaleRecords(now);

  const existing = ipStore.get(identifier);

  if (!existing || now > existing.resetTime) {
    ipStore.set(identifier, {
      count: 1,
      resetTime: now + windowMs,
    });
    return {
      allowed: true,
      remaining: maxRequests - 1,
      retryAfterSeconds: Math.ceil(windowMs / 1000),
      resetTime: now + windowMs,
    };
  }

  if (existing.count >= maxRequests) {
    const retryAfter = Math.max(1, Math.ceil((existing.resetTime - now) / 1000));
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: retryAfter,
      resetTime: existing.resetTime,
    };
  }

  existing.count += 1;
  const retryAfter = Math.max(1, Math.ceil((existing.resetTime - now) / 1000));
  return {
    allowed: true,
    remaining: maxRequests - existing.count,
    retryAfterSeconds: retryAfter,
    resetTime: existing.resetTime,
  };
}

/**
 * Resets the in-memory rate limit store (used in test suites).
 */
export function resetRateLimits(): void {
  ipStore.clear();
}

/**
 * Extracts client IP using a deployment-aware proxy strategy.
 * Evaluates trusted edge provider headers (Cloudflare, Vercel) before falling back to X-Forwarded-For.
 */
export function getClientIp(headers: Headers): string {
  // 1. Trusted Cloudflare connecting IP
  const cfIp = headers.get('cf-connecting-ip');
  if (cfIp) return cfIp.trim();

  // 2. Vercel edge forwarded IP
  const vercelIp = headers.get('x-vercel-forwarded-for');
  if (vercelIp) {
    const parts = vercelIp.split(',');
    return parts[0].trim();
  }

  // 3. Direct real IP header
  const realIp = headers.get('x-real-ip');
  if (realIp) return realIp.trim();

  // 4. Standard X-Forwarded-For: Take the first hop or fallback
  const forwardedFor = headers.get('x-forwarded-for');
  if (forwardedFor) {
    const parts = forwardedFor.split(',');
    const first = parts[0].trim();
    if (first) return first;
  }

  return '127.0.0.1';
}
