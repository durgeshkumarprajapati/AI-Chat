import { DynamicTopKResult } from '../query-intelligence.types';

export interface DynamicTopKBounds {
  minCandidateK: number;
  maxCandidateK: number;
  minFinalK: number;
  maxFinalK: number;
}

/**
 * Pure fn computing candidateK/finalK from complexity/ambiguity signals, strictly clamped to the
 * configured bounds — output can never exceed [minCandidateK, maxCandidateK] / [minFinalK,
 * maxFinalK] regardless of how extreme the inputs are.
 */
export class DynamicTopKService {
  public compute(
    complexity: number,
    isBroad: boolean,
    isAmbiguous: boolean,
    bounds: DynamicTopKBounds,
    baseVectorK: number,
    baseKeywordK: number,
    baseTopK: number
  ): DynamicTopKResult {
    const boostFactor = 1 + complexity * 0.5 + (isBroad ? 0.3 : 0) + (isAmbiguous ? 0.2 : 0);

    const candidateK = this.clamp(
      Math.round(Math.max(baseVectorK, baseKeywordK) * boostFactor),
      bounds.minCandidateK,
      bounds.maxCandidateK
    );
    const finalK = this.clamp(Math.round(baseTopK * boostFactor), bounds.minFinalK, bounds.maxFinalK);

    return { candidateK, finalK };
  }

  private clamp(v: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, v));
  }
}

export const dynamicTopKService = new DynamicTopKService();
