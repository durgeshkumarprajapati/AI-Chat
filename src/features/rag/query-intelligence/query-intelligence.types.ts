export type QueryIntent =
  | 'FACTUAL'
  | 'COMPARATIVE'
  | 'SUMMARIZATION'
  | 'TABLE_LOOKUP'
  | 'CHART_LOOKUP'
  | 'BROAD_EXPLORATION'
  | 'NARROW_LOOKUP'
  | 'PROCEDURAL'
  | 'UNKNOWN';

export type RoutingConfidence = 'HIGH' | 'MEDIUM' | 'LOW';

export interface RetrievalStrategyConfig {
  vectorWeight: number;
  keywordWeight: number;
  /**
   * Informational only today: GraphRAG (src/features/knowledge-graph/retrieval/graph-rag.service.ts)
   * has no live caller in the answer-orchestrator path. This flag is observable via telemetry
   * but has zero effect on retrieval until GraphRAG is wired into the live path.
   */
  graphPriority: boolean;
  minSimilarityOverride?: number;
}

export interface DynamicTopKResult {
  candidateK: number;
  finalK: number;
}

export interface QueryIntelligenceResult {
  intent: QueryIntent;
  expectedDocumentTypes: string[];
  expectedSections: string[];
  isBroad: boolean;
  isAmbiguous: boolean;
  isTableOrChartQuery: boolean;
  complexity: number;
  retrievalStrategy: 'BALANCED' | 'VECTOR_HEAVY' | 'KEYWORD_HEAVY' | 'GRAPH_PRIORITY' | 'SECTION_FOCUSED';
  source: 'heuristic' | 'heuristic+llm' | 'heuristic-fallback';
  analysisMs: number;
  cacheHit: boolean;
}

export interface DocumentRoutingResult {
  confidence: RoutingConfidence;
  candidateDocumentIds: string[];
  boostDocumentIds: string[];
}
