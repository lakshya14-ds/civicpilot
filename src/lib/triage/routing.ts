import { Department } from '@/types';
import { DEFAULT_DEPARTMENTS } from '@/lib/constants';

interface RoutingResult {
  department: Department;
  requires_human_review: boolean;
  review_reasons: string[];
}

export function routeComplaint(
  category: string,
  subcategory: string,
  confidence: number,
  safetyFlags: string[],
  explicitReviewFlag: boolean,
  departments: Department[] = DEFAULT_DEPARTMENTS
): RoutingResult {
  const normCategory = (category || 'other').toLowerCase().trim();
  const normSubcategory = (subcategory || '').toLowerCase().trim();
  const reviewReasons: string[] = [];
  const pilotCategory = normCategory === 'roads' || normCategory === 'sanitation' ||
    (normCategory === 'electrical' && normSubcategory === 'streetlights');

  // Department ownership varies across Bengaluru's city corporations. Only the
  // three pilot categories enter a provisional queue before officer validation.
  let matchedDepartment = pilotCategory ? departments.find((dept) =>
    dept.supported_categories.some(
      (cat) => cat.toLowerCase() === normCategory || (normSubcategory && cat.toLowerCase() === normSubcategory)
    )
  ) : undefined;

  // Fallback queue if no department matches
  if (!matchedDepartment) {
    matchedDepartment =
      departments.find((d) => d.slug === 'fallback_review') ||
      departments[departments.length - 1] ||
      DEFAULT_DEPARTMENTS[5];
    reviewReasons.push(pilotCategory
      ? 'Unrecognized pilot category; sent to Bengaluru pilot review queue'
      : 'Outside the three-category Bengaluru pilot; officer must verify agency and jurisdiction');
  }

  // Human review triggers:
  // 1. Low AI confidence (< 0.70)
  if (confidence < 0.7) {
    reviewReasons.push(`Low AI classification confidence (${(confidence * 100).toFixed(0)}% < 70%)`);
  }

  // 2. Explicit review flag or safety hazard needing confirmation
  if (explicitReviewFlag) {
    reviewReasons.push('AI extraction flagged complex or ambiguous description for review');
  }

  // 3. Category is 'other' or 'unknown'
  if (normCategory === 'other' || normCategory === 'unknown') {
    reviewReasons.push('General or unclassified complaint category');
  }

  // 4. Critical safety flag with confidence < 0.85 (needs officer validation)
  if (safetyFlags && safetyFlags.length > 0 && confidence < 0.85) {
    reviewReasons.push(`Public safety hazard detected (${safetyFlags.join(', ')}) requiring human verification`);
  }

  const requiresReview = reviewReasons.length > 0;

  return {
    department: matchedDepartment,
    requires_human_review: requiresReview,
    review_reasons: reviewReasons,
  };
}
