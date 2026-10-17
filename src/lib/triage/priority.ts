import { PriorityBreakdown, PriorityLabel } from '@/types';

interface PriorityCalculationInput {
  severity: number; // 1 to 5
  safety_flags?: string[];
  duplicate_count?: number;
  sla_urgency?: boolean;
}

/**
 * Deterministic, Transparent Priority Calculation Formula
 *
 * Formula:
 * 1. Base Severity Weight: severity * 0.70  (Range: 0.70 - 3.50)
 * 2. Safety Multiplier: 1.35 if any public safety hazard flag is present, else 1.00
 * 3. Duplicate Crowd Boost: min(1.00, duplicate_count * 0.25) (Each additional citizen report adds 0.25)
 * 4. SLA Urgency Factor: 0.50 if approaching or past deadline, else 0.00
 *
 * Total Score = (Base Severity Weight * Safety Multiplier) + Duplicate Crowd Boost + SLA Urgency Factor
 *
 * Thresholds:
 * - Total Score >= 4.50 -> 'critical'
 * - Total Score >= 3.40 -> 'high'
 * - Total Score >= 2.20 -> 'medium'
 * - Total Score <  2.20 -> 'low'
 */
export function calculatePriorityScore(input: PriorityCalculationInput): PriorityBreakdown {
  const severity = Math.max(1, Math.min(5, Number(input.severity) || 3));
  const baseSeverityWeight = Number((severity * 0.7).toFixed(2));

  const hasSafetyFlag = Boolean(input.safety_flags && input.safety_flags.length > 0);
  const safetyMultiplier = hasSafetyFlag ? 1.35 : 1.0;

  const duplicateCount = Math.max(0, Number(input.duplicate_count) || 0);
  const duplicateCrowdBoost = Number(Math.min(1.0, duplicateCount * 0.25).toFixed(2));

  const slaUrgencyFactor = input.sla_urgency ? 0.5 : 0.0;

  const rawTotal = baseSeverityWeight * safetyMultiplier + duplicateCrowdBoost + slaUrgencyFactor;
  const totalScore = Number(rawTotal.toFixed(2));

  let priorityLabel: PriorityLabel = 'low';
  if (totalScore >= 4.5 || severity === 5) {
    priorityLabel = 'critical';
  } else if (totalScore >= 3.4) {
    priorityLabel = 'high';
  } else if (totalScore >= 2.2) {
    priorityLabel = 'medium';
  } else {
    priorityLabel = 'low';
  }

  return {
    base_severity_weight: baseSeverityWeight,
    safety_multiplier: safetyMultiplier,
    duplicate_crowd_boost: duplicateCrowdBoost,
    sla_urgency_factor: slaUrgencyFactor,
    total_score: totalScore,
    priority_label: priorityLabel,
  };
}
