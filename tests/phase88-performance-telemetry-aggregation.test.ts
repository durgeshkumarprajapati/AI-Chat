// Phase 88 Part B — telemetry-aggregation.service.ts. Exercises the REAL singletons (perf ring
// buffer, llmTelemetryService, ragPerformanceTelemetryService, knowledgeGraphTelemetryService) via
// their existing public recording methods rather than mocking them, since the whole point of this
// service is aggregating what those real, already-shipped telemetry sinks actually record. Each
// test calls `jest.resetModules()` + re-`require`s so every test starts from a fresh, empty
// in-memory buffer/counter state (these are process-lifetime singletons that would otherwise leak
// state across tests in this file).

describe('Phase 88 — TelemetryAggregationService', () => {
  const freshModules = () => {
    jest.resetModules();
    const { telemetryAggregationService } = require('@/features/performance/telemetry-aggregation.service');
    const { perfTelemetryService } = require('@/features/performance/perf-telemetry.service');
    const { llmTelemetryService } = require('@/features/llm/llm-telemetry.service');
    const { ragPerformanceTelemetryService } = require('@/features/rag/performance/rag-telemetry.service');
    const { knowledgeGraphTelemetryService } = require('@/features/knowledge-graph/telemetry/knowledge-graph-telemetry.service');
    return { telemetryAggregationService, perfTelemetryService, llmTelemetryService, ragPerformanceTelemetryService, knowledgeGraphTelemetryService };
  };

  describe('getApiLatencyPercentiles', () => {
    it('reports available:false with a real reason when the ring buffer is empty', () => {
      const { telemetryAggregationService } = freshModules();

      const result = telemetryAggregationService.getApiLatencyPercentiles();

      expect(result.available).toBe(false);
      expect(typeof result.reason).toBe('string');
      expect(result.reason.length).toBeGreaterThan(0);
      expect(result.data).toBeUndefined();
    });

    it('known-input-known-output: 100 synthetic latencies (1..100ms) produce hand-computed p50/p95/p99', () => {
      const { telemetryAggregationService, perfTelemetryService } = freshModules();

      // Same floor(length * percentile) indexing as LLMTelemetryService.getDiagnostics(): sorted
      // ascending [1..100], index 50 -> value 51, index 95 -> value 96, index 99 -> value 100.
      for (let ms = 1; ms <= 100; ms++) {
        perfTelemetryService.recordApiRequest({
          route: 'api:/synthetic',
          durationMs: ms,
          success: true,
          timestamp: new Date().toISOString()
        });
      }

      const result = telemetryAggregationService.getApiLatencyPercentiles();

      expect(result.available).toBe(true);
      expect(result.data!.count).toBe(100);
      expect(result.data!.p50).toBe(51);
      expect(result.data!.p95).toBe(96);
      expect(result.data!.p99).toBe(100);
      expect(result.data!.routeBreakdown).toEqual([{ route: 'api:/synthetic', p50: 51, p95: 96, count: 100 }]);
    });

    it('breaks latency down per route independently', () => {
      const { telemetryAggregationService, perfTelemetryService } = freshModules();

      for (let i = 0; i < 10; i++) {
        perfTelemetryService.recordApiRequest({ route: 'api:/fast', durationMs: 10, success: true, timestamp: new Date().toISOString() });
      }
      for (let i = 0; i < 5; i++) {
        perfTelemetryService.recordApiRequest({ route: 'api:/slow', durationMs: 2000, success: true, timestamp: new Date().toISOString() });
      }

      const result = telemetryAggregationService.getApiLatencyPercentiles();

      expect(result.available).toBe(true);
      const fast = result.data!.routeBreakdown.find((r: any) => r.route === 'api:/fast');
      const slow = result.data!.routeBreakdown.find((r: any) => r.route === 'api:/slow');
      expect(fast).toEqual({ route: 'api:/fast', p50: 10, p95: 10, count: 10 });
      expect(slow).toEqual({ route: 'api:/slow', p50: 2000, p95: 2000, count: 5 });
    });
  });

  describe('getSlowestOperations', () => {
    it('reports available:false when neither the API buffer nor LLM telemetry has any data', () => {
      const { telemetryAggregationService } = freshModules();

      const result = telemetryAggregationService.getSlowestOperations();

      expect(result.available).toBe(false);
      expect(typeof result.reason).toBe('string');
    });

    it('ranks API routes and the aggregate LLM operation by descending avgMs', () => {
      const { telemetryAggregationService, perfTelemetryService, llmTelemetryService } = freshModules();

      perfTelemetryService.recordApiRequest({ route: 'api:/cheap', durationMs: 20, success: true, timestamp: new Date().toISOString() });
      perfTelemetryService.recordApiRequest({ route: 'api:/expensive', durationMs: 4000, success: true, timestamp: new Date().toISOString() });
      llmTelemetryService.recordEvent({ provider: 'openai', model: 'gpt', totalMs: 1500, cached: false, success: true });

      const result = telemetryAggregationService.getSlowestOperations(10);

      expect(result.available).toBe(true);
      const operations = result.data!.map((op: any) => op.operation);
      // Descending by avgMs: expensive route (4000) > llm.generate (1500) > cheap route (20).
      expect(operations.indexOf('api:/expensive')).toBeLessThan(operations.indexOf('llm.generate'));
      expect(operations.indexOf('llm.generate')).toBeLessThan(operations.indexOf('api:/cheap'));
    });

    it('respects the limit parameter', () => {
      const { telemetryAggregationService, perfTelemetryService } = freshModules();

      for (let i = 0; i < 5; i++) {
        perfTelemetryService.recordApiRequest({ route: `api:/r${i}`, durationMs: 10 * (i + 1), success: true, timestamp: new Date().toISOString() });
      }

      const result = telemetryAggregationService.getSlowestOperations(2);

      expect(result.available).toBe(true);
      expect(result.data).toHaveLength(2);
    });
  });

  describe('getCacheHitRatios', () => {
    it('reports available:false with a real reason when no cache source has recorded any activity', () => {
      const { telemetryAggregationService } = freshModules();

      const result = telemetryAggregationService.getCacheHitRatios();

      expect(result.available).toBe(false);
      expect(typeof result.reason).toBe('string');
    });

    it('computes hit ratios from real RAG/LLM/KG counters, omitting sources with zero activity', () => {
      const { telemetryAggregationService, llmTelemetryService, ragPerformanceTelemetryService, knowledgeGraphTelemetryService } = freshModules();

      // RAG answer cache: 3 hits, 1 miss -> 75%.
      ragPerformanceTelemetryService.logEvent({ event: 'rag.cache.answer.hit', requestId: 'r1', cacheHit: true });
      ragPerformanceTelemetryService.logEvent({ event: 'rag.cache.answer.hit', requestId: 'r2', cacheHit: true });
      ragPerformanceTelemetryService.logEvent({ event: 'rag.cache.answer.hit', requestId: 'r3', cacheHit: true });
      ragPerformanceTelemetryService.logEvent({ event: 'rag.cache.answer.miss', requestId: 'r4', cacheHit: false });

      // LLM gateway cache: 1 hit, 1 miss -> 50%.
      llmTelemetryService.recordEvent({ provider: 'openai', model: 'gpt', cached: true, totalMs: 5, success: true });
      llmTelemetryService.recordEvent({ provider: 'openai', model: 'gpt', cached: false, totalMs: 500, success: true });

      // Knowledge Graph cache left untouched -> omitted entirely, not fabricated as 0%.

      const result = telemetryAggregationService.getCacheHitRatios();

      expect(result.available).toBe(true);
      const bySource = Object.fromEntries(result.data!.map((d: any) => [d.source, d]));
      expect(bySource['rag-answer-cache']).toEqual({ source: 'rag-answer-cache', hitRatio: 75, hits: 3, misses: 1 });
      expect(bySource['llm-gateway-cache']).toEqual({ source: 'llm-gateway-cache', hitRatio: 50, hits: 1, misses: 1 });
      expect(bySource['knowledge-graph-cache']).toBeUndefined();
      expect(knowledgeGraphTelemetryService.getDiagnostics().cacheHits).toBe(0);
    });
  });
});
