import { env } from '@/config/env';

export interface RerankWeights {
  semanticWeight: number;
  keywordWeight: number;
  graphWeight: number;
  metadataWeight: number;
  sectionWeight: number;
  documentTypeWeight: number;
  freshnessWeight: number;
  multimodalWeight: number;
}

export interface QueryIntelligenceConfig {
  masterEnabled: boolean;
  queryIntelligenceEnabled: boolean;
  queryRoutingEnabled: boolean;
  metadataRetrievalEnabled: boolean;
  sectionAwareRetrievalEnabled: boolean;
  adaptiveStrategyEnabled: boolean;
  dynamicTopKEnabled: boolean;
  advancedRerankingEnabled: boolean;
  queryIntelligenceTimeoutMs: number;
  minCandidateK: number;
  maxCandidateK: number;
  minFinalK: number;
  maxFinalK: number;
  rerankWeights: RerankWeights;
}

/** Defensively normalizes weights to sum to 1 so misconfiguration never silently double- or under-weights the formula. */
function normalizeWeights(raw: RerankWeights): RerankWeights {
  const sum =
    raw.semanticWeight +
    raw.keywordWeight +
    raw.graphWeight +
    raw.metadataWeight +
    raw.sectionWeight +
    raw.documentTypeWeight +
    raw.freshnessWeight +
    raw.multimodalWeight;

  if (!Number.isFinite(sum) || sum <= 0) {
    return raw;
  }

  return {
    semanticWeight: raw.semanticWeight / sum,
    keywordWeight: raw.keywordWeight / sum,
    graphWeight: raw.graphWeight / sum,
    metadataWeight: raw.metadataWeight / sum,
    sectionWeight: raw.sectionWeight / sum,
    documentTypeWeight: raw.documentTypeWeight / sum,
    freshnessWeight: raw.freshnessWeight / sum,
    multimodalWeight: raw.multimodalWeight / sum
  };
}

export function getQueryIntelligenceConfig(): QueryIntelligenceConfig {
  const rawWeights: RerankWeights = {
    semanticWeight: env.server?.RAG_RERANK_SEMANTIC_WEIGHT ?? 0.35,
    keywordWeight: env.server?.RAG_RERANK_KEYWORD_WEIGHT ?? 0.20,
    graphWeight: env.server?.RAG_RERANK_GRAPH_WEIGHT ?? 0.15,
    metadataWeight: env.server?.RAG_RERANK_METADATA_WEIGHT ?? 0.10,
    sectionWeight: env.server?.RAG_RERANK_SECTION_WEIGHT ?? 0.10,
    documentTypeWeight: env.server?.RAG_RERANK_DOCUMENT_TYPE_WEIGHT ?? 0.05,
    freshnessWeight: env.server?.RAG_RERANK_FRESHNESS_WEIGHT ?? 0.03,
    multimodalWeight: env.server?.RAG_RERANK_MULTIMODAL_WEIGHT ?? 0.02
  };

  return {
    masterEnabled: env.server?.RAG_INTELLIGENCE_RETRIEVAL_ENABLED ?? false,
    queryIntelligenceEnabled: env.server?.RAG_QUERY_INTELLIGENCE_ENABLED ?? false,
    queryRoutingEnabled: env.server?.RAG_QUERY_ROUTING_ENABLED ?? false,
    metadataRetrievalEnabled: env.server?.RAG_METADATA_RETRIEVAL_ENABLED ?? false,
    sectionAwareRetrievalEnabled: env.server?.RAG_SECTION_AWARE_RETRIEVAL_ENABLED ?? false,
    adaptiveStrategyEnabled: env.server?.RAG_ADAPTIVE_STRATEGY_ENABLED ?? false,
    dynamicTopKEnabled: env.server?.RAG_DYNAMIC_TOP_K_ENABLED ?? false,
    advancedRerankingEnabled: env.server?.RAG_ADVANCED_RERANKING_ENABLED ?? false,
    queryIntelligenceTimeoutMs: env.server?.RAG_QUERY_INTELLIGENCE_TIMEOUT_MS ?? 3000,
    minCandidateK: env.server?.RAG_MIN_CANDIDATE_K ?? 10,
    maxCandidateK: env.server?.RAG_MAX_CANDIDATE_K ?? 40,
    minFinalK: env.server?.RAG_MIN_FINAL_K ?? 5,
    maxFinalK: env.server?.RAG_MAX_FINAL_K ?? 15,
    rerankWeights: normalizeWeights(rawWeights)
  };
}
