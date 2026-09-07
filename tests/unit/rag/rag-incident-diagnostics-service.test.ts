const mockComputeRagHealth = jest.fn();
jest.mock('@/features/rag/evaluation/rag-health.service', () => ({
  ragHealthService: { computeRagHealth: (...args: unknown[]) => mockComputeRagHealth(...args) },
  isRagHealthTimeWindow: (value: unknown) => value === '1h' || value === '24h' || value === '7d' || value === '30d'
}));

import { ragIncidentDiagnosticsService } from '@/features/rag/evaluation/rag-incident-diagnostics.service';

function alert(overrides: Record<string, unknown> = {}) {
  return {
    id: 'alert-1', category: 'CITATION', metric: 'uncitedAnswerRatePercent', severity: 'WARNING', status: 'OPEN',
    currentValue: 55, baselineValue: 40, thresholdValue: 40, window: '24h', sampleSize: 100, detectionCount: 3,
    firstDetectedAt: new Date(Date.now() - 3600000), lastDetectedAt: new Date(), resolvedAt: null,
    ...overrides
  };
}

function fullHealth(overrides: Record<string, unknown> = {}) {
  return {
    window: '24h',
    overview: { available: true, totalRequests: 100, fallbackCount: 0, fallbackRate: 0, requestFailureCount: 2, avgTotalLatencyMs: 1200 },
    retrieval: { available: true, avgRetrievalLatencyMs: 300, avgRetrievedChunkCount: 5, zeroChunkRatePercent: 1, cacheHitRate: { available: true, hitRatioPercent: 50 } },
    graph: { available: true, sampleSize: 50, sampleCoveragePercent: 50, graphAttemptedRatePercent: 40, graphSuccessRatePercent: 90 },
    citations: { available: true, sampleSize: 50, sampleCoveragePercent: 50, attributionQualityDistribution: { HIGH: 30, LOW: 5 } },
    failures: { requestFailureCount: 2, requestFailureCountScope: 'in_memory_since_process_start', llmGenerationFailureCount: null, retrievalFailureCount: null },
    limitations: [],
    ...overrides
  };
}

describe('RagIncidentDiagnosticsService.getDiagnostics', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns alert-derived fields plus live health fields when everything is available', async () => {
    mockComputeRagHealth.mockResolvedValue(fullHealth());

    const result = await ragIncidentDiagnosticsService.getDiagnostics(alert() as any);

    expect(result.currentValue).toBe(55);
    expect(result.baselineValue).toBe(40);
    expect(result.thresholdValue).toBe(40);
    expect(result.sampleSize).toBe(100);
    expect(result.window).toBe('24h');
    expect(result.detectionCount).toBe(3);
    expect(result.alertDurationMs).toBeGreaterThan(0);
    expect(result.totalLatencyMs).toBe(1200);
    expect(result.retrievalLatencyMs).toBe(300);
    expect(result.graphAttemptedRatePercent).toBe(40);
    expect(result.graphSuccessRatePercent).toBe(90);
    expect(result.citationAttributionQualityDistribution).toEqual({ HIGH: 30, LOW: 5 });
    expect(result.requestFailureCount).toBe(2);
  });

  it('never fabricates a value — returns null for any block reporting unavailable', async () => {
    mockComputeRagHealth.mockResolvedValue(fullHealth({
      overview: { available: false, totalRequests: 0, fallbackCount: 0, fallbackRate: 0, requestFailureCount: 0, avgTotalLatencyMs: null },
      retrieval: { available: false, avgRetrievalLatencyMs: null, avgRetrievedChunkCount: null, zeroChunkRatePercent: null, cacheHitRate: { available: false } },
      graph: { available: false, sampleSize: 0, sampleCoveragePercent: 0 },
      citations: { available: false, sampleSize: 0, sampleCoveragePercent: 0 }
    }));

    const result = await ragIncidentDiagnosticsService.getDiagnostics(alert() as any);

    expect(result.totalLatencyMs).toBeNull();
    expect(result.retrievalLatencyMs).toBeNull();
    expect(result.graphAttemptedRatePercent).toBeNull();
    expect(result.graphSuccessRatePercent).toBeNull();
    expect(result.citationAttributionQualityDistribution).toBeNull();
    expect(result.requestFailureCount).toBeNull();
  });

  it('returns null health-derived fields (not a throw) when the alert window is not a recognized time window', async () => {
    const result = await ragIncidentDiagnosticsService.getDiagnostics(alert({ window: 'not-a-window' }) as any);

    expect(mockComputeRagHealth).not.toHaveBeenCalled();
    expect(result.totalLatencyMs).toBeNull();
    expect(result.window).toBe('not-a-window');
  });

  it('degrades to null fields (not a throw) if the health aggregation itself fails', async () => {
    mockComputeRagHealth.mockRejectedValue(new Error('DB unavailable'));
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const result = await ragIncidentDiagnosticsService.getDiagnostics(alert() as any);

    expect(result.totalLatencyMs).toBeNull();
    expect(result.currentValue).toBe(55);
    consoleErrorSpy.mockRestore();
  });

  it('contains no raw RAG content — only counts/rates/enums/distributions', async () => {
    mockComputeRagHealth.mockResolvedValue(fullHealth());

    const result = await ragIncidentDiagnosticsService.getDiagnostics(alert() as any);

    expect(Object.keys(result)).not.toEqual(expect.arrayContaining(['question', 'answer', 'documentContent', 'entityId', 'prompt']));
  });
});
