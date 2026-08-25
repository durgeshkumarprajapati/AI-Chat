// Public surface of the Query Intelligence module (Phase 69B). Callers should import only from
// here rather than reaching into heuristics/llm-enhancement/routing/etc. internals directly.
export { queryIntelligenceService } from './query-intelligence.service';
export { documentRoutingService } from './routing/document-routing.service';
export { strategySelectorService } from './strategy/strategy-selector.service';
export { dynamicTopKService } from './strategy/dynamic-topk.service';
export { IntelligenceAwareReranker } from './reranking/intelligence-aware-reranker';
export { getQueryIntelligenceConfig } from './query-intelligence.config';
export { queryIntelligenceTelemetryService } from './telemetry/query-intelligence-telemetry.service';
export type {
  QueryIntelligenceResult,
  QueryIntent,
  RoutingConfidence,
  RetrievalStrategyConfig,
  DynamicTopKResult,
  DocumentRoutingResult
} from './query-intelligence.types';
