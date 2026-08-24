import { webSearchProviderRegistry } from './providers/provider-registry';
import { webSearchCacheService } from './cache/web-search-cache.service';
import { urlValidatorService } from './crawling/url-validator.service';
import { sourceTrustService } from './ranking/source-trust.service';
import { webIntelligenceTelemetryService } from './telemetry/web-intelligence.telemetry.service';
import { webSearchDecisionService } from './decision/web-search-decision.service';
import { WebSearchRequest, WebSearchResponse, WebEvidence, WebSearchDecision } from './web-intelligence.types';

export class WebIntelligenceService {
  /**
   * Evaluates whether Web Search should run.
   */
  public evaluateDecision(
    query: string,
    internalConfidenceScore: number,
    sourceMode?: string
  ): WebSearchDecision {
    return webSearchDecisionService.evaluateDecision(query, internalConfidenceScore, sourceMode);
  }

  /**
   * Executes Web Search with caching, SSRF validation, and source trust ranking.
   */
  public async searchWeb(request: WebSearchRequest): Promise<{
    response: WebSearchResponse;
    evidence: WebEvidence[];
  }> {
    const startTime = Date.now();
    const activeProvider = webSearchProviderRegistry.getActiveProvider();

    webIntelligenceTelemetryService.logEvent({
      event: 'web.search.started',
      provider: activeProvider.name,
      queryLength: request.query.length
    });

    // 1. Check Redis cache first
    const cached = await webSearchCacheService.get(request.query);
    if (cached) {
      webIntelligenceTelemetryService.logEvent({
        event: 'web.cache.hit',
        provider: activeProvider.name,
        resultCount: cached.results.length
      });

      const validatedResults = cached.results.filter(
        (r) => urlValidatorService.validate(r.url).isValid
      );
      const evidence = sourceTrustService.evaluateAndRank(validatedResults);

      return {
        response: { ...cached, results: validatedResults },
        evidence
      };
    }

    webIntelligenceTelemetryService.logEvent({
      event: 'web.cache.miss',
      provider: activeProvider.name
    });

    // 2. Perform external search via provider
    try {
      const searchRes = await activeProvider.search(request);

      // 3. SSRF URL Validation
      const validatedResults = searchRes.results.filter(
        (r) => urlValidatorService.validate(r.url).isValid
      );

      // 4. Source Trust & Ranking
      const evidence = sourceTrustService.evaluateAndRank(validatedResults);
      const finalRes: WebSearchResponse = {
        ...searchRes,
        results: validatedResults,
        totalMs: Date.now() - startTime
      };

      // 5. Cache result
      await webSearchCacheService.set(request.query, finalRes);

      webIntelligenceTelemetryService.logEvent({
        event: 'web.search.completed',
        provider: activeProvider.name,
        durationMs: finalRes.totalMs,
        resultCount: validatedResults.length
      });

      return {
        response: finalRes,
        evidence
      };
    } catch (err: any) {
      webIntelligenceTelemetryService.logEvent({
        event: 'web.search.failed',
        provider: activeProvider.name,
        reason: err.message
      });

      return {
        response: {
          query: request.query,
          results: [],
          totalMs: Date.now() - startTime,
          provider: activeProvider.name
        },
        evidence: []
      };
    }
  }
}

export const webIntelligenceService = new WebIntelligenceService();
