import { QueryIntent, RetrievalStrategyConfig } from '../query-intelligence.types';

/**
 * Pure fn: QueryIntent → retrieval weight bias. `graphPriority` is an explicit no-op placeholder
 * today — GraphRAG (src/features/knowledge-graph/retrieval/graph-rag.service.ts) has no live
 * caller in the answer-orchestrator path. It is threaded through to telemetry only, with zero
 * effect on retrieval, until GraphRAG is wired into the live path in a future phase.
 */
export class StrategySelectorService {
  public selectStrategy(intent: QueryIntent, baseVectorWeight: number, baseKeywordWeight: number): RetrievalStrategyConfig {
    switch (intent) {
      case 'NARROW_LOOKUP':
      case 'FACTUAL':
        return { vectorWeight: baseVectorWeight, keywordWeight: baseKeywordWeight, graphPriority: false };
      case 'COMPARATIVE':
      case 'TABLE_LOOKUP':
        return {
          vectorWeight: Math.max(0.3, baseVectorWeight - 0.15),
          keywordWeight: Math.min(0.7, baseKeywordWeight + 0.15),
          graphPriority: false
        };
      case 'BROAD_EXPLORATION':
      case 'SUMMARIZATION':
        return {
          vectorWeight: Math.min(0.9, baseVectorWeight + 0.1),
          keywordWeight: Math.max(0.1, baseKeywordWeight - 0.1),
          graphPriority: true
        };
      case 'CHART_LOOKUP':
        return { vectorWeight: baseVectorWeight, keywordWeight: baseKeywordWeight, graphPriority: false };
      case 'PROCEDURAL':
        return { vectorWeight: baseVectorWeight, keywordWeight: baseKeywordWeight, graphPriority: false };
      default:
        return { vectorWeight: baseVectorWeight, keywordWeight: baseKeywordWeight, graphPriority: false };
    }
  }
}

export const strategySelectorService = new StrategySelectorService();
