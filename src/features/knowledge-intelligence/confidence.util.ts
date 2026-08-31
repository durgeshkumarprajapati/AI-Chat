import { ConfidenceBand } from '@prisma/client';

/**
 * Numeric (0-1) internal confidence score -> coarse, user-facing `ConfidenceBand`.
 *
 * Thresholds (documented, not tuned from data — reasonable defaults, adjustable later):
 *   LOW    : score <  0.5
 *   MEDIUM : 0.5 <= score <= 0.75
 *   HIGH   : score >  0.75
 */
export function scoreToConfidenceBand(score: number): ConfidenceBand {
  const clamped = clampScore(score);
  if (clamped > 0.75) return 'HIGH';
  if (clamped >= 0.5) return 'MEDIUM';
  return 'LOW';
}

/**
 * A deliberately coarse, rounded-to-one-decimal label (e.g. "approx. 0.8"). Never format a
 * confidence score with fake precision (e.g. "97.324%") in any user-facing string — only the
 * band, or at most this coarse approximation, should ever be shown to a person.
 */
export function coarseApproxLabel(score: number): string {
  const clamped = clampScore(score);
  const rounded = Math.round(clamped * 10) / 10;
  return `approx. ${rounded.toFixed(1)}`;
}

export function clampScore(score: number): number {
  if (Number.isNaN(score)) return 0;
  if (score === Infinity) return 1;
  if (score === -Infinity) return 0;
  return Math.max(0, Math.min(1, score));
}

export interface ConfidenceEvaluation {
  /** Clamped 0-1 internal score. Never surface this raw value with fake precision to a user. */
  score: number;
  band: ConfidenceBand;
  /** Human-readable contributing factors, safe to display alongside the band. */
  factors: string[];
  /** Coarse, rounded label — safe to display if a numeric hint is truly needed. */
  approxLabel: string;
}

/**
 * Combines a numeric score with a human-readable factor list into a single evaluation object,
 * ready to persist onto `IntelligenceInsight.confidenceBand`/`confidenceScore`.
 */
export function evaluateConfidence(score: number, factors: string[] = []): ConfidenceEvaluation {
  const clamped = clampScore(score);
  return {
    score: clamped,
    band: scoreToConfidenceBand(clamped),
    factors,
    approxLabel: coarseApproxLabel(clamped)
  };
}

/**
 * Combines two independent 0-1 signals (e.g. our own heuristic score and an LLM's self-reported
 * confidence) into one blended score via a simple weighted average. Kept as a named, documented
 * function rather than inline arithmetic so the blending strategy is easy to find and change.
 */
export function blendConfidence(scoreA: number, weightA: number, scoreB: number, weightB: number): number {
  const totalWeight = weightA + weightB;
  if (totalWeight <= 0) return 0;
  return clampScore((clampScore(scoreA) * weightA + clampScore(scoreB) * weightB) / totalWeight);
}
