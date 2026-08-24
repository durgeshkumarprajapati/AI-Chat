import { HybridCandidate } from '../rag.types';
import { RAGConfigService } from '../rag.config';

export interface Reranker {
  rerank(_query: string, _candidates: HybridCandidate[]): Promise<HybridCandidate[]>;
}

export class DeterministicReranker implements Reranker {
  public async rerank(query: string, candidates: HybridCandidate[]): Promise<HybridCandidate[]> {
    if (!candidates || candidates.length === 0) return [];

    const finalLimit = RAGConfigService.getFinalContextResults();
    const queryTerms = query
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length > 2);

    const reranked = candidates.map((candidate) => {
      const contentLower = candidate.content.toLowerCase();
      let matchCount = 0;
      for (const term of queryTerms) {
        if (contentLower.includes(term)) matchCount++;
      }
      const termDensity = queryTerms.length > 0 ? matchCount / queryTerms.length : 0;
      const rerankScore = Number((candidate.score * 0.7 + termDensity * 0.3).toFixed(4));

      return {
        ...candidate,
        rerankScore,
        score: rerankScore
      };
    });

    reranked.sort((a, b) => b.score - a.score);
    return reranked.slice(0, finalLimit);
  }
}

export const rerankerService = new DeterministicReranker();
