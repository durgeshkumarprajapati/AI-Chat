import { ragPerformanceTelemetryService } from '@/features/rag/performance/rag-telemetry.service';

/**
 * rag-telemetry.service.ts has zero imports (no env/prisma dependency), so this runs fully in this
 * sandbox. logEvent() short-circuits after updating its cache counters when NODE_ENV==='test' (so
 * normal test runs never spam console.log) — these tests deliberately flip NODE_ENV to a
 * production-like value for the duration of each assertion that needs to exercise the real
 * sanitize/console.log path, then restore it.
 */

function withProductionLikeEnv(fn: () => void) {
  const original = process.env.NODE_ENV;
  (process.env as any).NODE_ENV = 'production';
  try {
    fn();
  } finally {
    (process.env as any).NODE_ENV = original;
  }
}

describe('RagPerformanceTelemetryService.logEvent', () => {
  it('9. never throws, even when metadata contains a circular reference (telemetry failure must not break a request)', () => {
    withProductionLikeEnv(() => {
      const circular: Record<string, unknown> = { a: 1 };
      circular.self = circular;

      expect(() =>
        ragPerformanceTelemetryService.logEvent({
          event: 'rag.retrieval.completed',
          requestId: 'req-1',
          metadata: circular
        })
      ).not.toThrow();
    });
  });

  it('redacts metadata keys that look sensitive (content/text/prompt/key/token/secret/password)', () => {
    withProductionLikeEnv(() => {
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      try {
        ragPerformanceTelemetryService.logEvent({
          event: 'rag.retrieval.completed',
          requestId: 'req-1',
          metadata: {
            documentContent: 'sensitive raw text', promptText: 'the raw prompt',
            apiKey: 'sk-secret', chunkCount: 3
          }
        });

        const logged = logSpy.mock.calls[0]?.[0] as string;
        expect(logged).toContain('[REDACTED]');
        expect(logged).not.toContain('sensitive raw text');
        expect(logged).not.toContain('the raw prompt');
        expect(logged).not.toContain('sk-secret');
        expect(logged).toContain('"chunkCount":3');
      } finally {
        logSpy.mockRestore();
      }
    });
  });

  it('accepts every new event name added by the observability-hardening pass without throwing', () => {
    withProductionLikeEnv(() => {
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      try {
        for (const event of [
          'rag.retrieval.completed',
          'rag.llm.generation.completed',
          'rag.citation.attribution.completed',
          'rag.request.completed',
          'rag.request.failed'
        ] as const) {
          expect(() => ragPerformanceTelemetryService.logEvent({ event, requestId: 'req-1' })).not.toThrow();
        }
      } finally {
        logSpy.mockRestore();
      }
    });
  });

  it('counts cache hit/miss events toward getCacheDiagnostics regardless of NODE_ENV', () => {
    const before = ragPerformanceTelemetryService.getCacheDiagnostics();
    ragPerformanceTelemetryService.logEvent({ event: 'rag.cache.answer.hit', requestId: 'req-1', cacheHit: true });
    ragPerformanceTelemetryService.logEvent({ event: 'rag.cache.answer.miss', requestId: 'req-2', cacheHit: false });
    const after = ragPerformanceTelemetryService.getCacheDiagnostics();

    expect(after.hits).toBe(before.hits + 1);
    expect(after.misses).toBe(before.misses + 1);
  });
});
