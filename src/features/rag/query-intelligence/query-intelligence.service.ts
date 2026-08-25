import { heuristicAnalyzerService } from './heuristics/heuristic-analyzer.service';
import { llmQueryEnhancerService } from './llm-enhancement/llm-query-enhancer.service';
import { queryIntelligenceCacheService } from './cache/query-intelligence-cache.service';
import { queryIntelligenceTelemetryService } from './telemetry/query-intelligence-telemetry.service';
import { QueryIntelligenceResult } from './query-intelligence.types';

export interface AnalyzeOptions {
  knowledgeBaseId?: string;
  useLLMEnhancement: boolean;
  timeoutMs: number;
}

/**
 * QueryIntelligenceService.analyze(): heuristic (always, synchronous) -> cache check -> optional
 * timeout-bounded LLM enhance -> merge -> cache write (best-effort) -> telemetry. NEVER throws —
 * any internal failure still returns the heuristic result, so callers never need try/catch.
 */
export class QueryIntelligenceService {
  public async analyze(userId: string, question: string, options: AnalyzeOptions): Promise<QueryIntelligenceResult> {
    const startedAt = Date.now();
    const heuristicResult = heuristicAnalyzerService.analyze(question);

    try {
      const cached = await queryIntelligenceCacheService.get(userId, options.knowledgeBaseId, question);
      if (cached) {
        const result: QueryIntelligenceResult = { ...cached, cacheHit: true, analysisMs: Date.now() - startedAt };
        this.emitAnalyzed(userId, question, result);
        return result;
      }

      let result = heuristicResult;

      if (options.useLLMEnhancement) {
        const enhancement = await llmQueryEnhancerService.enhance(question, heuristicResult, userId, options.timeoutMs);
        if (enhancement) {
          result = {
            ...heuristicResult,
            intent: enhancement.intent ?? heuristicResult.intent,
            expectedDocumentTypes: enhancement.expectedDocumentTypes ?? heuristicResult.expectedDocumentTypes,
            expectedSections: enhancement.expectedSections ?? heuristicResult.expectedSections,
            source: 'heuristic+llm',
            analysisMs: Date.now() - startedAt
          };
        }
      }

      result = { ...result, analysisMs: Date.now() - startedAt };
      await queryIntelligenceCacheService.set(userId, options.knowledgeBaseId, question, result);
      this.emitAnalyzed(userId, question, result);
      return result;
    } catch (err) {
      console.warn('[QueryIntelligenceService] Analysis failed unexpectedly (using heuristic-only result):', err);
      const fallback: QueryIntelligenceResult = { ...heuristicResult, source: 'heuristic-fallback', analysisMs: Date.now() - startedAt };
      this.emitAnalyzed(userId, question, fallback);
      return fallback;
    }
  }

  private emitAnalyzed(userId: string, question: string, result: QueryIntelligenceResult): void {
    queryIntelligenceTelemetryService.logEvent({
      event: 'rag.query.analyzed',
      userId,
      question,
      intent: result.intent,
      durationMs: result.analysisMs,
      source: result.source
    });
  }
}

export const queryIntelligenceService = new QueryIntelligenceService();
