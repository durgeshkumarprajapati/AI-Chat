import { classifyIntent } from './intent-classifier';
import { detectDocumentTypeHints } from './doctype-hint-detector';
import { detectSectionHints } from './section-hint-detector';
import { scoreComplexity } from './complexity-scorer';
import { QueryIntelligenceResult } from '../query-intelligence.types';

const INTENT_TO_STRATEGY: Record<string, QueryIntelligenceResult['retrievalStrategy']> = {
  FACTUAL: 'BALANCED',
  NARROW_LOOKUP: 'BALANCED',
  COMPARATIVE: 'KEYWORD_HEAVY',
  TABLE_LOOKUP: 'KEYWORD_HEAVY',
  BROAD_EXPLORATION: 'VECTOR_HEAVY',
  SUMMARIZATION: 'VECTOR_HEAVY',
  PROCEDURAL: 'SECTION_FOCUSED',
  CHART_LOOKUP: 'VECTOR_HEAVY',
  UNKNOWN: 'BALANCED'
};

/**
 * Composes the deterministic heuristic sub-analyzers into a single synchronous
 * QueryIntelligenceResult. Never throws — each sub-step is defensively wrapped, and a total
 * failure still returns a safe, fully-populated default result.
 */
export class HeuristicAnalyzerService {
  public analyze(question: string): QueryIntelligenceResult {
    const startedAt = Date.now();

    try {
      const intent = classifyIntent(question);
      const expectedDocumentTypes = detectDocumentTypeHints(question);
      const expectedSections = detectSectionHints(question);
      const { complexity, isBroad, isAmbiguous } = scoreComplexity(question);
      const isTableOrChartQuery = intent === 'TABLE_LOOKUP' || intent === 'CHART_LOOKUP';

      return {
        intent,
        expectedDocumentTypes,
        expectedSections,
        isBroad,
        isAmbiguous,
        isTableOrChartQuery,
        complexity,
        retrievalStrategy: INTENT_TO_STRATEGY[intent] ?? 'BALANCED',
        source: 'heuristic',
        analysisMs: Date.now() - startedAt,
        cacheHit: false
      };
    } catch {
      return {
        intent: 'UNKNOWN',
        expectedDocumentTypes: [],
        expectedSections: [],
        isBroad: false,
        isAmbiguous: false,
        isTableOrChartQuery: false,
        complexity: 0,
        retrievalStrategy: 'BALANCED',
        source: 'heuristic-fallback',
        analysisMs: Date.now() - startedAt,
        cacheHit: false
      };
    }
  }
}

export const heuristicAnalyzerService = new HeuristicAnalyzerService();
