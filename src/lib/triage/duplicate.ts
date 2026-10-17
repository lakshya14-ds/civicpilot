import { Complaint, DuplicateCheckResult } from '@/types';

const STOP_WORDS = new Set([
  'the', 'is', 'at', 'which', 'on', 'a', 'an', 'and', 'or', 'in', 'near', 'to',
  'of', 'for', 'it', 'there', 'our', 'my', 'we', 'has', 'have', 'been', 'with',
  'this', 'that', 'by', 'from', 'as', 'very', 'please', 'someone', 'urgent'
]);

function tokenizeAndClean(text: string): string[] {
  if (!text) return [];
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
}

function calculateJaccardSimilarity(tokens1: string[], tokens2: string[]): number {
  if (tokens1.length === 0 || tokens2.length === 0) return 0;
  const set1 = new Set(tokens1);
  const set2 = new Set(tokens2);

  let intersectionCount = 0;
  set1.forEach((token) => {
    if (set2.has(token)) intersectionCount += 1;
  });

  const unionSize = new Set([...tokens1, ...tokens2]).size;
  return unionSize > 0 ? intersectionCount / unionSize : 0;
}

function extractLocationTokens(locationText: string): string[] {
  if (!locationText) return [];
  return tokenizeAndClean(locationText);
}

/**
 * Two-stage Duplicate Complaint Detection
 *
 * Stage 1: Fast deterministic filtering by category, active window (14 days),
 *          and location keyword overlap.
 * Stage 2: Lexical & semantic similarity comparison on cleaned complaint text.
 *
 * Critical Rule: Never merge complaints mentioning the same broad topic at
 * different locations (e.g. pothole on Ring Road vs pothole on MG Road).
 */
export function checkDuplicateComplaint(
  incoming: {
    description: string;
    location_text?: string;
    category?: string;
  },
  existingComplaints: Complaint[],
  windowDays: number = 14
): DuplicateCheckResult {
  const incomingCategory = (incoming.category || '').toLowerCase().trim();
  const incomingTokens = tokenizeAndClean(incoming.description);
  const incomingLocTokens = extractLocationTokens(incoming.location_text || '');

  const now = Date.now();
  const maxWindowMs = windowDays * 24 * 3600 * 1000;

  // Filter candidates within window that are not already closed or rejected
  const candidates = existingComplaints.filter((c) => {
    if (c.status === 'closed' || c.status === 'rejected') return false;
    const ageMs = now - new Date(c.created_at).getTime();
    if (ageMs > maxWindowMs) return false;
    // Same category or closely related
    if (incomingCategory && c.category && c.category.toLowerCase() !== incomingCategory) {
      return false;
    }
    return true;
  });

  if (candidates.length === 0) {
    return {
      is_duplicate: false,
      confidence: 0,
      similarity_reason: 'No existing complaints in the same category within active window.',
      stage: 'none',
    };
  }

  let bestMatch: Complaint | undefined = undefined;
  let highestScore = 0;
  let matchReason = '';
  let matchStage: 'stage1_deterministic' | 'stage2_semantic' = 'stage1_deterministic';

  for (const candidate of candidates) {
    const candidateTokens = tokenizeAndClean(candidate.description);
    const candidateLocTokens = extractLocationTokens(candidate.location_text || '');

    // Check location compatibility
    let locationScore = 0.5; // neutral if neither or only one has location text
    if (incomingLocTokens.length > 0 && candidateLocTokens.length > 0) {
      const locOverlap = calculateJaccardSimilarity(incomingLocTokens, candidateLocTokens);
      if (locOverlap > 0.4) {
        locationScore = 1.0; // High location match
      } else if (locOverlap === 0) {
        // Explicitly different location names specified! (e.g. "Main Gate" vs "MG Road")
        locationScore = 0.05; // Drastically penalize mismatching locations
      } else {
        locationScore = 0.6;
      }
    }

    // Text semantic overlap
    const textSimilarity = calculateJaccardSimilarity(incomingTokens, candidateTokens);

    // Combined confidence score
    // Weight: 55% text similarity, 45% location agreement
    const combinedScore = textSimilarity * 0.55 + locationScore * 0.45;

    // Direct exact location and keyword match bonus (Stage 1)
    const exactLocMatch =
      incoming.location_text &&
      candidate.location_text &&
      incoming.location_text.toLowerCase().trim() === candidate.location_text.toLowerCase().trim();

    if (exactLocMatch && textSimilarity > 0.35) {
      const stage1Score = 0.85 + textSimilarity * 0.1;
      if (stage1Score > highestScore) {
        highestScore = stage1Score;
        bestMatch = candidate;
        matchStage = 'stage1_deterministic';
        matchReason = `Identical reported location "${candidate.location_text}" and matching civic issue keyword set.`;
      }
    } else if (combinedScore > highestScore) {
      highestScore = combinedScore;
      bestMatch = candidate;
      matchStage = 'stage2_semantic';
      matchReason = `High semantic text similarity (${(textSimilarity * 100).toFixed(0)}%) with compatible location context.`;
    }
  }

  // Threshold: >= 0.72 is a confirmed duplicate candidate
  const isDuplicate = highestScore >= 0.72 && bestMatch !== undefined;

  return {
    is_duplicate: isDuplicate,
    confidence: Number(highestScore.toFixed(3)),
    canonical_complaint: isDuplicate ? bestMatch : undefined,
    similarity_reason: isDuplicate
      ? matchReason
      : highestScore > 0.45
      ? `Possible related topic (Score: ${(highestScore * 100).toFixed(0)}%), but location or specific details differ.`
      : 'Distinct civic issue.',
    stage: isDuplicate ? matchStage : 'none',
  };
}
