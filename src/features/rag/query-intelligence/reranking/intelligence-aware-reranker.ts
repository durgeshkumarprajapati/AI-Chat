import { Reranker, localReranker } from '@/features/rag/retrieval/reranker';
import { RetrievedChunk } from '@/features/rag/retrieval/retrieval.types';
import { sectionScoringService } from '../section/section-scoring.service';
import { getQueryIntelligenceConfig } from '../query-intelligence.config';

export interface RerankSignalContext {
  expectedDocumentTypes: string[];
  expectedSections: string[];
  boostDocumentIds: string[];
  isTableOrChartQuery: boolean;
}

const EMPTY_CONTEXT: RerankSignalContext = {
  expectedDocumentTypes: [],
  expectedSections: [],
  boostDocumentIds: [],
  isTableOrChartQuery: false
};

const FRESHNESS_HALF_LIFE_DAYS = 180;

/**
 * Decorator wrapping the existing, unmodified `localReranker` — never mutates its output in
 * place, only adds an additive weighted boost on top. Only ever constructed when
 * RAG_ADVANCED_RERANKING_ENABLED is true; when disabled, callers use `localReranker` directly
 * instead of injecting this at all.
 */
export class IntelligenceAwareReranker implements Reranker {
  private readonly base: Reranker;
  private readonly context: RerankSignalContext;

  constructor(base: Reranker = localReranker, context: RerankSignalContext = EMPTY_CONTEXT) {
    this.base = base;
    this.context = context;
  }

  public rerank(query: string, candidates: RetrievedChunk[]): RetrievedChunk[] {
    const baseRanked = this.base.rerank(query, candidates);
    const weights = getQueryIntelligenceConfig().rerankWeights;

    const rescored = baseRanked.map((chunk) => {
      const documentTypeScore = this.scoreDocumentType(chunk);
      const sectionScore = sectionScoringService.score(this.context.expectedSections, chunk.metadata);
      const freshnessScore = this.scoreFreshness(chunk);
      const multimodalScore = this.scoreMultimodal(chunk);
      const boostScore = this.context.boostDocumentIds.includes(chunk.documentId) ? 1 : 0;

      const additive =
        weights.documentTypeWeight * documentTypeScore +
        weights.sectionWeight * sectionScore +
        weights.freshnessWeight * freshnessScore +
        weights.multimodalWeight * multimodalScore +
        weights.documentTypeWeight * 0.5 * boostScore;

      const base = chunk.rerankScore ?? chunk.hybridScore ?? chunk.similarity;

      return {
        ...chunk,
        rerankScore: Number(Math.min(1.0, base + additive).toFixed(4))
      };
    });

    return rescored.sort((a, b) => (b.rerankScore ?? 0) - (a.rerankScore ?? 0));
  }

  private scoreDocumentType(chunk: RetrievedChunk): number {
    const t = chunk.metadata?.documentType;
    return typeof t === 'string' && this.context.expectedDocumentTypes.includes(t) ? 1 : 0;
  }

  private scoreFreshness(chunk: RetrievedChunk): number {
    if (!chunk.documentCreatedAt) return 0;
    const createdAt = new Date(chunk.documentCreatedAt).getTime();
    if (Number.isNaN(createdAt)) return 0;
    const ageDays = (Date.now() - createdAt) / (1000 * 60 * 60 * 24);
    if (ageDays < 0) return 0;
    // Exponential decay: newer documents score closer to 1, older documents decay toward 0.
    return Math.exp((-Math.LN2 * ageDays) / FRESHNESS_HALF_LIFE_DAYS);
  }

  private scoreMultimodal(chunk: RetrievedChunk): number {
    if (!this.context.isTableOrChartQuery) return 0;
    const contentType = chunk.metadata?.contentType;
    return Boolean(chunk.metadata?.isVisual) || contentType === 'TABLE' || contentType === 'CHART' ? 1 : 0;
  }
}
