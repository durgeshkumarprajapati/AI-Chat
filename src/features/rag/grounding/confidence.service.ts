import { HybridCandidate, RAGConfidence } from '../rag.types';

export class ConfidenceService {
  /**
   * Evaluates evidence confidence based on candidate scores, engine diversity, and coverage.
   */
  public evaluateConfidence(candidates: HybridCandidate[]): RAGConfidence {
    if (!candidates || candidates.length === 0) {
      return {
        score: 0,
        level: 'LOW',
        reason: 'No matching evidence found in knowledge sources.'
      };
    }

    const topScore = candidates[0]?.score || 0;
    const maxSourcesCount = Math.max(...candidates.map((c) => c.sources.length));
    const multiEngineBoost = maxSourcesCount > 1 ? 0.15 : 0;
    const countBoost = Math.min(0.1, candidates.length * 0.02);

    const calculatedScore = Math.min(1.0, Math.max(0, topScore + multiEngineBoost + countBoost));
    const roundedScore = Number(calculatedScore.toFixed(4));

    if (roundedScore >= 0.8) {
      return {
        score: roundedScore,
        level: 'HIGH',
        reason: 'Strong evidence supported by multiple matching document chunks and engines.'
      };
    }

    if (roundedScore >= 0.6) {
      return {
        score: roundedScore,
        level: 'MEDIUM',
        reason: 'Moderate evidence found in knowledge base sources.'
      };
    }

    return {
      score: roundedScore,
      level: 'LOW',
      reason: 'Limited evidence found in knowledge sources. Information may be incomplete.'
    };
  }
}

export const confidenceService = new ConfidenceService();
