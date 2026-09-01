// Phase 88 Part B — regression coverage for the additive /api/admin/performance extension
// (apiLatency, slowestOperations, cacheHitRatios, workflowMetrics). telemetry-aggregation.service
// itself is unit-tested in tests/phase88-performance-telemetry-aggregation.test.ts; this file
// mocks it directly so the route's own wiring (config reads, `meetsTarget`/`isSlow` derivation,
// the best-effort automationExecution query, and the "never fabricate — available:false with a
// reason" contract) can be asserted deterministically.
jest.mock('@/lib/auth', () => ({
  requireAuthenticatedUser: jest.fn(),
  requireRole: jest.fn((user, role) => {
    if (user.role !== role) {
      const { AuthorizationError } = require('@/errors');
      throw new AuthorizationError('Administrator privileges are required.');
    }
  })
}));
jest.mock('@/lib/prisma', () => ({
  prisma: {
    $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
    ragEvaluation: {
      aggregate: jest.fn().mockResolvedValue({
        _avg: { latencyMs: null, retrievalLatencyMs: null, llmLatencyMs: null, llmFirstTokenMs: null }
      }),
      count: jest.fn().mockResolvedValue(0)
    },
    automationExecution: {
      groupBy: jest.fn()
    }
  }
}));
jest.mock('@/lib/redis', () => ({
  redis: { set: jest.fn().mockResolvedValue(undefined), get: jest.fn().mockResolvedValue('1') }
}));
jest.mock('@/features/config', () => ({
  configService: { getNumber: jest.fn().mockResolvedValue(1000), getBoolean: jest.fn().mockResolvedValue(true) }
}));
jest.mock('@/features/performance/telemetry-aggregation.service', () => ({
  telemetryAggregationService: {
    getApiLatencyPercentiles: jest.fn(),
    getSlowestOperations: jest.fn(),
    getCacheHitRatios: jest.fn()
  }
}));

import { NextRequest } from 'next/server';
import { requireAuthenticatedUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { telemetryAggregationService } from '@/features/performance/telemetry-aggregation.service';
import { GET } from '@/app/api/admin/performance/route';

const mockAllUnavailable = () => {
  (telemetryAggregationService.getApiLatencyPercentiles as jest.Mock).mockReturnValue({ available: false, reason: 'no data' });
  (telemetryAggregationService.getSlowestOperations as jest.Mock).mockReturnValue({ available: false, reason: 'no data' });
  (telemetryAggregationService.getCacheHitRatios as jest.Mock).mockReturnValue({ available: false, reason: 'no data' });
};

describe('Phase 88 — /api/admin/performance telemetry aggregation extension', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (requireAuthenticatedUser as jest.Mock).mockResolvedValue({ id: 'admin-1', role: 'ADMIN' });
  });

  it('never fabricates apiLatency — reports available:false with a real reason when the aggregation service has no data', async () => {
    mockAllUnavailable();
    (prisma.automationExecution.groupBy as jest.Mock).mockResolvedValue([]);

    const res = await GET(new NextRequest('http://localhost:3000/api/admin/performance'));
    const json = await res.json();

    expect(json.data.apiLatency).toEqual({ available: false, reason: 'no data' });
  });

  it('surfaces apiLatency percentiles with a meetsTarget flag derived from PERF_API_TARGET_LATENCY_MS', async () => {
    mockAllUnavailable();
    (telemetryAggregationService.getApiLatencyPercentiles as jest.Mock).mockReturnValue({
      available: true,
      data: { p50: 100, p95: 500, p99: 900, count: 42, routeBreakdown: [{ route: 'api:/foo', p50: 100, p95: 500, count: 42 }] }
    });
    (prisma.automationExecution.groupBy as jest.Mock).mockResolvedValue([]);

    const res = await GET(new NextRequest('http://localhost:3000/api/admin/performance'));
    const json = await res.json();

    expect(json.data.apiLatency.available).toBe(true);
    expect(json.data.apiLatency.p95).toBe(500);
    expect(json.data.apiLatency.targetLatencyMs).toBe(1000);
    expect(json.data.apiLatency.meetsTarget).toBe(true); // p95 (500) <= target (1000)
  });

  it('flags slowestOperations entries above PERF_SLOW_REQUEST_THRESHOLD_MS as isSlow', async () => {
    mockAllUnavailable();
    (telemetryAggregationService.getSlowestOperations as jest.Mock).mockReturnValue({
      available: true,
      data: [
        { operation: 'api:/slow', category: 'api', avgMs: 5000, count: 3 },
        { operation: 'api:/fast', category: 'api', avgMs: 50, count: 10 }
      ]
    });
    (prisma.automationExecution.groupBy as jest.Mock).mockResolvedValue([]);

    const res = await GET(new NextRequest('http://localhost:3000/api/admin/performance'));
    const json = await res.json();

    expect(json.data.slowestOperations.available).toBe(true);
    const bySlow = Object.fromEntries(json.data.slowestOperations.data.map((o: any) => [o.operation, o]));
    expect(bySlow['api:/slow'].isSlow).toBe(true); // 5000 > 1000
    expect(bySlow['api:/fast'].isSlow).toBe(false); // 50 <= 1000
  });

  it('passes cacheHitRatios through unchanged when available', async () => {
    mockAllUnavailable();
    (telemetryAggregationService.getCacheHitRatios as jest.Mock).mockReturnValue({
      available: true,
      data: [{ source: 'rag-answer-cache', hitRatio: 75, hits: 3, misses: 1 }]
    });
    (prisma.automationExecution.groupBy as jest.Mock).mockResolvedValue([]);

    const res = await GET(new NextRequest('http://localhost:3000/api/admin/performance'));
    const json = await res.json();

    expect(json.data.cacheHitRatios).toEqual({
      available: true,
      data: [{ source: 'rag-answer-cache', hitRatio: 75, hits: 3, misses: 1 }]
    });
  });

  it('never fabricates workflowMetrics — reports available:false with the real error when the Automation table/model is not usable yet', async () => {
    mockAllUnavailable();
    (prisma.automationExecution.groupBy as jest.Mock).mockRejectedValue(new Error('relation "automation_executions" does not exist'));

    const res = await GET(new NextRequest('http://localhost:3000/api/admin/performance'));
    const json = await res.json();

    expect(json.data.workflowMetrics.available).toBe(false);
    expect(json.data.workflowMetrics.reason).toContain('automation_executions');
  });

  it('reports workflowMetrics available:false (not a fabricated zero) when there are zero executions in the window', async () => {
    mockAllUnavailable();
    (prisma.automationExecution.groupBy as jest.Mock).mockResolvedValue([]);

    const res = await GET(new NextRequest('http://localhost:3000/api/admin/performance'));
    const json = await res.json();

    expect(json.data.workflowMetrics).toEqual({
      available: false,
      reason: 'No AutomationExecution rows in the last 24h — nothing to aggregate yet.'
    });
  });

  it('reports real workflowMetrics counts when execution rows exist', async () => {
    mockAllUnavailable();
    (prisma.automationExecution.groupBy as jest.Mock).mockResolvedValue([
      { status: 'COMPLETED', _count: { _all: 5 } },
      { status: 'FAILED', _count: { _all: 2 } }
    ]);

    const res = await GET(new NextRequest('http://localhost:3000/api/admin/performance'));
    const json = await res.json();

    expect(json.data.workflowMetrics).toEqual({
      available: true,
      sampleWindowHours: 24,
      totalExecutions: 7,
      byStatus: { COMPLETED: 5, FAILED: 2 }
    });
  });

  it('keeps the pre-existing fields (database/redis/rag/cache/worker/config) present and byte-identical in shape', async () => {
    mockAllUnavailable();
    (prisma.automationExecution.groupBy as jest.Mock).mockResolvedValue([]);

    const res = await GET(new NextRequest('http://localhost:3000/api/admin/performance'));
    const json = await res.json();

    expect(json.data.database).toEqual({ available: true, healthy: true, pingMs: expect.any(Number) });
    expect(json.data.redis).toEqual({ available: true, healthy: true, pingMs: expect.any(Number) });
    expect(json.data.rag).toEqual({
      available: false,
      sampleWindowHours: 24,
      sampleCount: 0,
      avgTotalLatencyMs: null,
      avgRetrievalLatencyMs: null,
      avgLlmLatencyMs: null,
      avgTimeToFirstTokenMs: null
    });
    expect(json.data.worker).toEqual({
      available: false,
      reason: expect.any(String)
    });
    expect(json.data.config).toEqual({
      slowQueryThresholdMs: 1000,
      multimodalImageProcessingConcurrency: 1000
    });
  });
});
