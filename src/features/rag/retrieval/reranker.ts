/* eslint-disable no-unused-vars */
import { RetrievedChunk } from './retrieval.types';

export interface Reranker {
  rerank(query: string, candidates: RetrievedChunk[]): RetrievedChunk[];
}

export class LocalReranker implements Reranker {
  public rerank(query: string, candidates: RetrievedChunk[]): RetrievedChunk[] {
    if (!query || candidates.length === 0) return candidates;

    const queryTerms = query
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter((t) => t.length > 2);

    const queryPhrase = query.toLowerCase().trim();

    const scored = candidates.map((chunk) => {
      const contentLower = chunk.content.toLowerCase();
      let matchCount = 0;

      for (const term of queryTerms) {
        if (contentLower.includes(term)) {
          matchCount++;
        }
      }

      const termCoverageRatio = queryTerms.length > 0 ? matchCount / queryTerms.length : 0;
      const exactPhraseMatch = queryPhrase.length > 3 && contentLower.includes(queryPhrase) ? 0.25 : 0;

      const baseHybrid = chunk.hybridScore ?? chunk.similarity;
      const rerankScore = Number(
        Math.min(1.0, baseHybrid * 0.65 + termCoverageRatio * 0.25 + exactPhraseMatch).toFixed(4)
      );

      return {
        ...chunk,
        rerankScore
      };
    });

    return scored.sort((a, b) => (b.rerankScore ?? 0) - (a.rerankScore ?? 0));
  }
}

export const localReranker = new LocalReranker();
