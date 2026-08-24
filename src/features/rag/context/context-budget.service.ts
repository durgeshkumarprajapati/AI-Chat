import { HybridCandidate } from '../rag.types';
import { RAGConfigService } from '../rag.config';

export class ContextBudgetService {
  /**
   * Fits candidates within RAG_MAX_CONTEXT_TOKENS budget.
   */
  public fitWithinBudget(candidates: HybridCandidate[]): HybridCandidate[] {
    const maxTokens = RAGConfigService.getMaxContextTokens();
    const result: HybridCandidate[] = [];
    let currentTokens = 0;

    for (const candidate of candidates) {
      const fullText =
        (candidate.parentContent || candidate.content) +
        (candidate.neighborBeforeContent || '') +
        (candidate.neighborAfterContent || '');

      const estimatedTokens = Math.ceil(fullText.length / 4);

      if (currentTokens + estimatedTokens <= maxTokens) {
        result.push(candidate);
        currentTokens += estimatedTokens;
      } else if (result.length === 0) {
        // Guarantee at least 1 candidate if available
        result.push(candidate);
        break;
      } else {
        break;
      }
    }

    return result;
  }
}

export const contextBudgetService = new ContextBudgetService();
