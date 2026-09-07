const mockAggregate = jest.fn();
const mockCount = jest.fn();
const mockFindMany = jest.fn();

jest.mock('@/lib/prisma', () => ({
  prisma: {
    ragEvaluation: {
      aggregate: (...args: unknown[]) => mockAggregate(...args),
      count: (...args: unknown[]) => mockCount(...args),
      findMany: (...args: unknown[]) => mockFindMany(...args)
    }
  }
}));

jest.mock('@/features/rag/performance/rag-telemetry.service', () => ({
  ragPerformanceTelemetryService: {
    getFailureDiagnostics: jest.fn().mockReturnValue({ requestFailures: 0 }),
    getCacheDiagnostics: jest.fn()
  }
}));

jest.mock('@/features/performance/telemetry-aggregation.service', () => ({
  telemetryAggregationService: {
    getCacheHitRatios: jest.fn().mockReturnValue({ available: false, reason: 'no data' })
  }
}));

import { ragHealthService, isRagHealthTimeWindow } from '@/features/rag/evaluation/rag-health.service';
import { ragPerformanceTelemetryService } from '@/features/rag/performance/rag-telemetry.service';
import { telemetryAggregationService } from '@/features/performance/telemetry-aggregation.service';

/**
 * rag-health.service.ts imports only @/lib/prisma (mocked above, no env dependency of its own —
 * confirmed by tracing) and the two already-existing telemetry services (also mocked) — no
 * @/config/env coupling, so this runs fully in this sandbox.
 */

function defaultAggregateResult(overrides: Partial<{ count: number; latencyMs: number | null; retrievalLatencyMs: number | null; retrievedChunkCount: number | null; citedChunkCount: number | null }> = {}) {
  return {
    _count: { _all: overrides.count ?? 0 },
    _avg: {
      latencyMs: overrides.latencyMs ?? null,
      retrievalLatencyMs: overrides.retrievalLatencyMs ?? null,
      retrievedChunkCount: overrides.retrievedChunkCount ?? null,
      citedChunkCount: overrides.citedChunkCount ?? null
    }
  };
}

function sampleRow(trace: Record<string, unknown>) {
  return { latencyTrace: trace };
}

describe('RagHealthService.computeRagHealth', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (ragPerformanceTelemetryService.getFailureDiagnostics as jest.Mock).mockReturnValue({ requestFailures: 0 });
    (telemetryAggregationService.getCacheHitRatios as jest.Mock).mockReturnValue({ available: false, reason: 'no data' });
  });

  it('2. reports overview.available=false and a clear limitation when there is no data in the window', async () => {
    mockAggregate.mockResolvedValue(defaultAggregateResult({ count: 0 }));
    mockCount.mockResolvedValue(0);
    mockFindMany.mockResolvedValue([]);

    const result = await ragHealthService.computeRagHealth('24h');

    expect(result.overview.available).toBe(false);
    expect(result.overview.totalRequests).toBe(0);
    expect(result.graph.available).toBe(false);
    expect(result.citations.available).toBe(false);
    expect(result.limitations.some((l) => l.includes('No RagEvaluation rows'))).toBe(true);
  });

  it('4. filters by the correct time window for each supported window value', async () => {
    mockAggregate.mockResolvedValue(defaultAggregateResult({ count: 5 }));
    mockCount.mockResolvedValue(0);
    mockFindMany.mockResolvedValue([]);

    for (const window of ['1h', '24h', '7d', '30d'] as const) {
      mockAggregate.mockClear();
      const before = Date.now();
      await ragHealthService.computeRagHealth(window);
      const call = mockAggregate.mock.calls[0]?.[0];
      const since: Date = call.where.createdAt.gte;
      const expectedMs = { '1h': 3600000, '24h': 86400000, '7d': 604800000, '30d': 2592000000 }[window];
      expect(before - since.getTime()).toBeGreaterThanOrEqual(expectedMs - 1000);
      expect(before - since.getTime()).toBeLessThanOrEqual(expectedMs + 5000);
    }
  });

  it('isRagHealthTimeWindow rejects unsupported values', () => {
    expect(isRagHealthTimeWindow('24h')).toBe(true);
    expect(isRagHealthTimeWindow('90d')).toBe(false);
    expect(isRagHealthTimeWindow(null)).toBe(false);
  });

  it('3. sampled data behavior: sampleCoveragePercent reflects sample size vs total population', async () => {
    mockAggregate.mockResolvedValue(defaultAggregateResult({ count: 1000, citedChunkCount: 1.2, retrievedChunkCount: 3.4 }));
    mockCount.mockResolvedValue(10);
    mockFindMany.mockResolvedValue(Array.from({ length: 200 }, () => sampleRow({ attributionQuality: 'VALID_REFERENCES' })));

    const result = await ragHealthService.computeRagHealth('24h');

    expect(result.citations.sampleSize).toBe(200);
    expect(result.citations.sampleCoveragePercent).toBe(20);
    expect(result.limitations.some((l) => l.includes('bounded sample'))).toBe(true);
  });

  it('5/6. aggregates graph success and failure counts, with failure category distribution', async () => {
    mockAggregate.mockResolvedValue(defaultAggregateResult({ count: 4 }));
    mockCount.mockResolvedValue(0);
    mockFindMany.mockResolvedValue([
      sampleRow({ graphReason: 'QUERY_CLASSIFIED_GRAPH_RELEVANT', graphAttempted: true, graphExecuted: true, graphSuccess: true, graphTotalMs: 50, graphChunksAddedCount: 2, graphDroppedByLimitCount: 0 }),
      sampleRow({ graphReason: 'QUERY_CLASSIFIED_GRAPH_RELEVANT', graphAttempted: true, graphExecuted: true, graphSuccess: false, graphFailureCategory: 'TIMEOUT' }),
      sampleRow({ graphReason: 'QUERY_CLASSIFIED_GRAPH_RELEVANT', graphAttempted: true, graphExecuted: true, graphSuccess: false, graphFailureCategory: 'DATABASE_FAILURE' }),
      sampleRow({ graphReason: 'FEATURE_DISABLED', graphAttempted: false, graphExecuted: false })
    ]);

    const result = await ragHealthService.computeRagHealth('24h');

    expect(result.graph.available).toBe(true);
    expect(result.graph.applicableRequestCount).toBe(4);
    expect(result.graph.graphExecutedCount).toBe(3);
    expect(result.graph.graphSuccessRatePercent).toBe(Number(((1 / 3) * 100).toFixed(1)));
    expect(result.graph.graphFailureCount).toBe(2);
    expect(result.graph.graphFailureCategoryDistribution).toEqual({ TIMEOUT: 1, DATABASE_FAILURE: 1 });
    expect(result.failures.graphRetrievalFailureCount).toBe(2);
    expect(result.failures.graphRetrievalFailureCategoryDistribution).toEqual({ TIMEOUT: 1, DATABASE_FAILURE: 1 });
  });

  it('graph.available=false when no sampled request reached the graph-eligible branch', async () => {
    mockAggregate.mockResolvedValue(defaultAggregateResult({ count: 2 }));
    mockCount.mockResolvedValue(0);
    mockFindMany.mockResolvedValue([sampleRow({ uncitedAnswer: false }), sampleRow({ uncitedAnswer: true })]);

    const result = await ragHealthService.computeRagHealth('24h');

    expect(result.graph.available).toBe(false);
    expect(result.graph.reason).toContain('graph-eligible');
  });

  it('7. attribution quality distribution is tallied correctly', async () => {
    mockAggregate.mockResolvedValue(defaultAggregateResult({ count: 3 }));
    mockCount.mockResolvedValue(0);
    mockFindMany.mockResolvedValue([
      sampleRow({ attributionQuality: 'VALID_REFERENCES' }),
      sampleRow({ attributionQuality: 'VALID_REFERENCES' }),
      sampleRow({ attributionQuality: 'NO_REFERENCES' })
    ]);

    const result = await ragHealthService.computeRagHealth('24h');

    expect(result.citations.attributionQualityDistribution).toEqual({ VALID_REFERENCES: 2, NO_REFERENCES: 1 });
  });

  it('8. uncited answer rate is computed correctly', async () => {
    mockAggregate.mockResolvedValue(defaultAggregateResult({ count: 4 }));
    mockCount.mockResolvedValue(0);
    mockFindMany.mockResolvedValue([
      sampleRow({ uncitedAnswer: true }),
      sampleRow({ uncitedAnswer: true }),
      sampleRow({ uncitedAnswer: false }),
      sampleRow({ uncitedAnswer: false })
    ]);

    const result = await ragHealthService.computeRagHealth('24h');

    expect(result.citations.uncitedAnswerRatePercent).toBe(50);
  });

  it('9. invalid/malformed/duplicate reference rates are computed correctly', async () => {
    mockAggregate.mockResolvedValue(defaultAggregateResult({ count: 2 }));
    mockCount.mockResolvedValue(0);
    mockFindMany.mockResolvedValue([
      sampleRow({ citationInvalidReferenceCount: 1, citationMalformedReferenceCount: 2, citationDuplicateReferenceCount: 0 }),
      sampleRow({ citationInvalidReferenceCount: 0, citationMalformedReferenceCount: 0, citationDuplicateReferenceCount: 3 })
    ]);

    const result = await ragHealthService.computeRagHealth('24h');

    // rates are expressed as (sum of counts / sample size) * 100 — a rate-of-occurrence per
    // request, not a fraction of requests affected (documented in the field's own type comment).
    expect(result.citations.invalidReferenceRatePercent).toBe(50);
    expect(result.citations.malformedReferenceRatePercent).toBe(100);
    expect(result.citations.duplicateReferenceRatePercent).toBe(150);
  });

  it('11. failures block always reports the in-memory request-failure count with its scope labeled', async () => {
    (ragPerformanceTelemetryService.getFailureDiagnostics as jest.Mock).mockReturnValue({ requestFailures: 7 });
    mockAggregate.mockResolvedValue(defaultAggregateResult({ count: 1 }));
    mockCount.mockResolvedValue(0);
    mockFindMany.mockResolvedValue([sampleRow({})]);

    const result = await ragHealthService.computeRagHealth('24h');

    expect(result.failures.requestFailureCount).toBe(7);
    expect(result.failures.requestFailureCountScope).toBe('in_memory_since_process_start');
    expect(result.failures.llmGenerationFailureCount).toBeNull();
    expect(result.failures.retrievalFailureCount).toBeNull();
  });

  it('10. never selects or leaks question/answer/document content — only latencyTrace is read', async () => {
    mockAggregate.mockResolvedValue(defaultAggregateResult({ count: 1 }));
    mockCount.mockResolvedValue(0);
    mockFindMany.mockResolvedValue([sampleRow({ attributionQuality: 'VALID_REFERENCES' })]);

    const result = await ragHealthService.computeRagHealth('24h');

    const findManyArgs = mockFindMany.mock.calls[0]?.[0];
    // Prisma's own `select` clause is the real guarantee — the query never even fetches
    // question/answer/document content from the database in the first place.
    expect(findManyArgs.select).toEqual({ latencyTrace: true });

    // Structural check on the actual response value (not a naive substring match against the
    // whole serialized object, which would false-positive on ordinary English words inside this
    // service's own documentation-style limitation strings, e.g. "answer correctness").
    const disallowedKeys = ['question', 'answer', 'documentContent', 'prompt'];
    const walk = (value: unknown): void => {
      if (Array.isArray(value)) {
        value.forEach(walk);
      } else if (value && typeof value === 'object') {
        for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
          expect(disallowedKeys).not.toContain(key);
          walk(v);
        }
      }
    };
    walk(result);
  });

  it('uses citedChunkCount (full population, typed column) for avgReferencedEvidenceCount, distinct from the sampled citation fields', async () => {
    mockAggregate.mockResolvedValue(defaultAggregateResult({ count: 50, citedChunkCount: 1.75, retrievedChunkCount: 4.5 }));
    mockCount.mockResolvedValue(0);
    mockFindMany.mockResolvedValue([sampleRow({ attributionQuality: 'VALID_REFERENCES' })]);

    const result = await ragHealthService.computeRagHealth('24h');

    expect(result.citations.avgReferencedEvidenceCount).toBe(1.75);
    expect(result.citations.avgRetrievedEvidenceCount).toBe(4.5);
  });

  it('gracefully degrades (available:false) rather than throwing when the sample query itself fails', async () => {
    mockAggregate.mockResolvedValue(defaultAggregateResult({ count: 5 }));
    mockCount.mockResolvedValue(0);
    mockFindMany.mockRejectedValue(new Error('db connection reset'));

    const result = await ragHealthService.computeRagHealth('24h');

    expect(result.graph.available).toBe(false);
    expect(result.citations.available).toBe(false);
    expect(result.overview.available).toBe(true); // the typed aggregate still succeeded
    expect(result.limitations.some((l) => l.includes('db connection reset'))).toBe(true);
  });
});
