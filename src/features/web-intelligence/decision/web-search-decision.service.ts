import { WebSearchDecision } from '../web-intelligence.types';
import { WebIntelligenceConfigService } from '../web-intelligence.config';

export class WebSearchDecisionService {
  /**
   * Decides whether an external Web Search should be executed.
   */
  public evaluateDecision(
    query: string,
    internalConfidenceScore: number,
    sourceMode?: string
  ): WebSearchDecision {
    if (!WebIntelligenceConfigService.isWebSearchEnabled()) {
      return {
        shouldSearchWeb: false,
        reason: 'Web search disabled by configuration flag',
        confidenceThresholdUsed: 0.8
      };
    }

    const mode = (sourceMode || '').toLowerCase();

    if (mode === 'documents' || mode === 'documents_only') {
      return {
        shouldSearchWeb: false,
        reason: 'User explicitly requested documents-only search mode',
        confidenceThresholdUsed: 0.8
      };
    }

    if (mode === 'web_search' || mode === 'web_only' || mode === 'web' || mode === 'web_discovery') {
      return {
        shouldSearchWeb: true,
        reason: 'User explicitly requested web search mode',
        confidenceThresholdUsed: 0.8
      };
    }

    const q = query.toLowerCase();
    const isCurrentInfoQuery = /\b(latest|current|today|now|recent|news|2026|weather|stock|price|release|event|update)\b/.test(
      q
    );

    if (isCurrentInfoQuery) {
      return {
        shouldSearchWeb: true,
        reason: 'Query requests real-time or current web information',
        confidenceThresholdUsed: 0.8
      };
    }

    if (internalConfidenceScore < 0.8) {
      return {
        shouldSearchWeb: true,
        reason: `Internal evidence confidence (${internalConfidenceScore.toFixed(2)}) is below high-confidence threshold (0.80)`,
        confidenceThresholdUsed: 0.8
      };
    }

    return {
      shouldSearchWeb: false,
      reason: `Internal RAG evidence confidence (${internalConfidenceScore.toFixed(2)}) is sufficient`,
      confidenceThresholdUsed: 0.8
    };
  }
}

export const webSearchDecisionService = new WebSearchDecisionService();
