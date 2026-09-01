import { randomUUID } from 'crypto';
import {
  LLMRequest,
  LLMResponse,
  LLMStreamChunk,
  StructuredLLMRequest,
  ProviderHealthStatus
} from '@/features/llm/llm.types';
import { llmRouterService, LLMRouterService } from '@/features/llm/llm-router.service';
import { llmCacheService, LLMCacheService } from '@/features/llm/llm-cache.service';
import { llmFallbackService, LLMFallbackService } from '@/features/llm/llm-fallback.service';
import { tokenBudgetManager, TokenBudgetManager } from '@/features/llm/utils/token-budget';
import { llmTelemetryService, LLMTelemetryService } from '@/features/llm/llm-telemetry.service';
import { llmModelRegistry, LLMModelRegistry } from '@/features/llm/llm-model-registry';
import { llmRateLimiterService, LLMRateLimiterService } from '@/features/llm/llm-rate-limiter.service';

export class LLMGateway {
  private router: LLMRouterService;
  private cache: LLMCacheService;
  private fallback: LLMFallbackService;
  private tokenBudget: TokenBudgetManager;
  private telemetry: LLMTelemetryService;
  private registry: LLMModelRegistry;
  private rateLimiter: LLMRateLimiterService;

  // Phase 88 — single-flight dedup for the cache-miss provider-call path. Keyed by the same
  // SHA-256 request hash the response cache already uses (userId+provider+model+prompt+context+
  // system+feature scoped), so it only collapses genuinely identical concurrent requests — never
  // cross-user or cross-prompt. Mirrors the existing `SingleFlightService` pattern used by RAG's
  // answer-orchestrator (src/features/rag/cache/single-flight.service.ts), scoped locally here
  // since it dedupes a different (LLM provider) code path than RAG's. Purely additive: rate-limit
  // consumption, telemetry, and cache writes still happen once per caller exactly as before —
  // only the expensive `fallback.executeWithFallback` call itself is shared across concurrent
  // identical in-flight requests. Each caller still computes its own `totalMs`/`requestId` from
  // its own start time after the shared promise resolves, so returned values are unaffected.
  private inFlightGenerateRequests = new Map<string, Promise<LLMResponse>>();

  constructor(
    router?: LLMRouterService,
    cache?: LLMCacheService,
    fallback?: LLMFallbackService,
    tokenBudget?: TokenBudgetManager,
    telemetry?: LLMTelemetryService,
    registry?: LLMModelRegistry,
    rateLimiter?: LLMRateLimiterService
  ) {
    this.router = router || llmRouterService;
    this.cache = cache || llmCacheService;
    this.fallback = fallback || llmFallbackService;
    this.tokenBudget = tokenBudget || tokenBudgetManager;
    this.telemetry = telemetry || llmTelemetryService;
    this.registry = registry || llmModelRegistry;
    this.rateLimiter = rateLimiter || llmRateLimiterService;
  }

  /**
   * Single-flight dedup: if another `generate()` call with the identical dedupe key (same
   * user/provider/model/prompt/context/system/feature) is already executing the provider call,
   * piggyback on its Promise instead of firing a second redundant provider request. Falls back to
   * calling `fn()` directly on any error scheduling the map itself (never blocks a request).
   */
  private executeDeduped(key: string, fn: () => Promise<LLMResponse>): Promise<LLMResponse> {
    const existing = this.inFlightGenerateRequests.get(key);
    if (existing) return existing;

    const promise = fn().finally(() => {
      this.inFlightGenerateRequests.delete(key);
    });
    this.inFlightGenerateRequests.set(key, promise);
    return promise;
  }

  /**
   * Main text generation facade. Handles token budgeting, response caching, intelligent routing, rate limiting, fallback, and telemetry.
   */
  public async generate(request: LLMRequest): Promise<LLMResponse> {
    const startTime = Date.now();
    const requestId = randomUUID();

    // 1. Token Budget Application
    const budgeted = this.tokenBudget.applyTokenBudget(request.systemPrompt, request.context, request.prompt);
    const req: LLMRequest = {
      ...request,
      systemPrompt: budgeted.systemPrompt,
      context: budgeted.context,
      prompt: budgeted.prompt
    };

    // 2. Intelligent Model Routing
    const { provider, decision } = this.router.resolveRoute(req);

    if (req.feature === 'CITY_EXPLORER' && decision.providerName === 'ollama') {
      const allowOllama = process.env.CITY_EXPLORER_ALLOW_OLLAMA_FALLBACK === 'true';
      if (!allowOllama && !req.localOnly) {
        throw new Error(
          `[LLMGateway] Architecture Violation: Ollama provider is forbidden for CITY_EXPLORER when CITY_EXPLORER_ALLOW_OLLAMA_FALLBACK=false.`
        );
      }
    }

    // 3. Cache Lookup
    const cachedRes = await this.cache.getCachedResponse(req, decision.providerName, decision.modelName);
    if (cachedRes) {
      this.telemetry.recordEvent({
        requestId,
        userIdHash: req.userId ? `user_${req.userId.slice(0, 8)}` : undefined,
        provider: decision.providerName,
        model: decision.modelName,
        feature: req.feature,
        complexity: decision.complexity,
        cached: true,
        totalMs: Date.now() - startTime,
        success: true
      });
      return {
        ...cachedRes,
        complexity: decision.complexity,
        cached: true,
        totalMs: Date.now() - startTime
      };
    }

    // 4. Provider Rate Limit Check
    const rl = await this.rateLimiter.checkRateLimit(decision.providerName, req.userId);
    if (!rl.allowed) {
      throw new Error(`Provider "${decision.providerName}" rate limit exceeded. Please retry in ${Math.ceil(rl.resetMs / 1000)}s.`);
    }

    // 5. Execution with Fallback (single-flight deduped across identical concurrent cache misses)
    try {
      const dedupeKey = this.cache.getCacheKey(req, decision.providerName, decision.modelName);
      const response = await this.executeDeduped(dedupeKey, () =>
        this.fallback.executeWithFallback(provider, req, decision.modelName).then((r) => r.response)
      );

      const finalRes: LLMResponse = {
        ...response,
        complexity: decision.complexity,
        cached: false,
        totalMs: Date.now() - startTime
      };

      // 6. Store in Response Cache
      await this.cache.setCachedResponse(req, decision.providerName, decision.modelName, finalRes);

      this.telemetry.recordEvent({
        requestId,
        userIdHash: req.userId ? `user_${req.userId.slice(0, 8)}` : undefined,
        provider: response.provider || decision.providerName,
        model: response.model || decision.modelName,
        feature: req.feature,
        complexity: decision.complexity,
        cached: false,
        totalMs: finalRes.totalMs,
        success: true
      });

      return finalRes;
    } catch (err: any) {
      this.telemetry.recordEvent({
        requestId,
        userIdHash: req.userId ? `user_${req.userId.slice(0, 8)}` : undefined,
        provider: decision.providerName,
        model: decision.modelName,
        feature: req.feature,
        complexity: decision.complexity,
        cached: false,
        totalMs: Date.now() - startTime,
        success: false,
        error: err.message || String(err)
      });
      throw err;
    }
  }

  /**
   * Main streaming facade. Delivers low time-to-first-token streaming.
   */
  public async *stream(request: LLMRequest): AsyncIterable<LLMStreamChunk> {
    const startTime = Date.now();
    const requestId = randomUUID();

    const budgeted = this.tokenBudget.applyTokenBudget(request.systemPrompt, request.context, request.prompt);
    const req: LLMRequest = {
      ...request,
      systemPrompt: budgeted.systemPrompt,
      context: budgeted.context,
      prompt: budgeted.prompt
    };

    const { provider, decision } = this.router.resolveRoute(req);

    const rl = await this.rateLimiter.checkRateLimit(decision.providerName, req.userId);
    if (!rl.allowed) {
      throw new Error(`Provider "${decision.providerName}" rate limit exceeded.`);
    }

    let firstTokenMs: number | undefined = undefined;

    try {
      for await (const chunk of this.fallback.streamWithFallback(provider, req)) {
        if (chunk.isFirstToken && firstTokenMs === undefined) {
          firstTokenMs = Date.now() - startTime;
        }
        yield chunk;
      }

      this.telemetry.recordEvent({
        requestId,
        userIdHash: req.userId ? `user_${req.userId.slice(0, 8)}` : undefined,
        provider: decision.providerName,
        model: decision.modelName,
        feature: req.feature,
        complexity: decision.complexity,
        cached: false,
        firstTokenMs,
        totalMs: Date.now() - startTime,
        success: true
      });
    } catch (err: any) {
      this.telemetry.recordEvent({
        requestId,
        userIdHash: req.userId ? `user_${req.userId.slice(0, 8)}` : undefined,
        provider: decision.providerName,
        model: decision.modelName,
        feature: req.feature,
        complexity: decision.complexity,
        cached: false,
        totalMs: Date.now() - startTime,
        success: false,
        error: err.message || String(err)
      });
      throw err;
    }
  }

  /**
   * Main structured JSON generation facade.
   */
  public async generateStructured<T>(request: StructuredLLMRequest<T>): Promise<T> {
    const budgeted = this.tokenBudget.applyTokenBudget(request.systemPrompt, request.context, request.prompt);
    const req: StructuredLLMRequest<T> = {
      ...request,
      systemPrompt: budgeted.systemPrompt,
      context: budgeted.context,
      prompt: budgeted.prompt
    };

    const { provider, decision } = this.router.resolveRoute(req);
    const rl = await this.rateLimiter.checkRateLimit(decision.providerName, req.userId);
    if (!rl.allowed) {
      throw new Error(`Provider "${decision.providerName}" rate limit exceeded.`);
    }

    const { data } = await this.fallback.generateStructuredWithFallback(provider, req);
    return data;
  }

  /**
   * Aggregates provider health check statuses.
   */
  public async healthCheck(): Promise<{ status: string; providers: Record<string, ProviderHealthStatus> }> {
    const providers = this.registry.getAllProviders();
    const results: Record<string, ProviderHealthStatus> = {};
    let overallHealthy = true;

    for (const p of providers) {
      try {
        const h = await p.healthCheck();
        results[p.name] = h;
        if (h.status === 'unhealthy') {
          overallHealthy = false;
        }
      } catch (err) {
        results[p.name] = {
          name: p.name,
          provider: p.name,
          status: 'unhealthy',
          configured: false,
          enabled: false,
          available: false,
          message: err instanceof Error ? err.message : String(err)
        };
        overallHealthy = false;
      }
    }

    return {
      status: overallHealthy ? 'healthy' : 'degraded',
      providers: results
    };
  }
}

export const llmGateway = new LLMGateway();
export const llmGatewayService = llmGateway;
