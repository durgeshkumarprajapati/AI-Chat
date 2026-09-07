const mockLoadConfig = jest.fn();
const mockComputeRagHealth = jest.fn();
const mockApplyDetectedConditions = jest.fn();

jest.mock('@/features/rag/evaluation/rag-health-alert-config', () => ({
  loadRagHealthAlertConfig: () => mockLoadConfig()
}));
jest.mock('@/features/rag/evaluation/rag-health.service', () => ({
  ragHealthService: { computeRagHealth: (...args: unknown[]) => mockComputeRagHealth(...args) }
}));
jest.mock('@/features/rag/evaluation/rag-health-alert.service', () => ({
  ragHealthAlertService: { applyDetectedConditions: (...args: unknown[]) => mockApplyDetectedConditions(...args) }
}));

import { ragHealthAlertCheckService } from '@/features/rag/evaluation/rag-health-alert-check.service';

const BASE_CONFIG = {
  enabled: true, checkIntervalMs: 900000, minSampleSize: 20,
  maxUncitedRatePercent: 40, maxInvalidReferenceRatePercent: 15, maxMalformedReferenceRatePercent: 15,
  maxGraphFailureRatePercent: 30, maxGraphLatencyMs: 3000, minGraphContributionRatePercent: 5,
  maxRetrievalLatencyMs: 3000, maxTotalLatencyMs: 8000, maxRequestFailureCount: 20,
  latencyAnomalyIncreasePercent: 50, rateAnomalyIncreasePoints: 15
};

function emptyRagHealth(window: string) {
  return {
    window,
    overview: { available: false, totalRequests: 0, fallbackCount: 0, fallbackRate: 0, requestFailureCount: 0, avgTotalLatencyMs: null },
    retrieval: { available: false, avgRetrievalLatencyMs: null, avgRetrievedChunkCount: null, zeroChunkRatePercent: null, cacheHitRate: { available: false } },
    graph: { available: false, sampleSize: 0, sampleCoveragePercent: 0 },
    citations: { available: false, sampleSize: 0, sampleCoveragePercent: 0 },
    failures: { requestFailureCount: 0, requestFailureCountScope: 'in_memory_since_process_start', llmGenerationFailureCount: null, retrievalFailureCount: null },
    limitations: []
  };
}

describe('RagHealthAlertCheckService.runHealthCheck', () => {
  beforeEach(() => jest.clearAllMocks());

  it('15. produces no alerts and makes no DB/aggregation calls at all when the feature is disabled', async () => {
    mockLoadConfig.mockResolvedValue({ ...BASE_CONFIG, enabled: false });

    const result = await ragHealthAlertCheckService.runHealthCheck();

    expect(result).toEqual({ enabled: false });
    expect(mockComputeRagHealth).not.toHaveBeenCalled();
    expect(mockApplyDetectedConditions).not.toHaveBeenCalled();
  });

  it('computes 1h, 24h, and 7d windows and applies detected conditions scoped to 1h/24h only when enabled', async () => {
    mockLoadConfig.mockResolvedValue(BASE_CONFIG);
    mockComputeRagHealth.mockImplementation((window: string) => Promise.resolve(emptyRagHealth(window)));
    mockApplyDetectedConditions.mockResolvedValue({ created: 0, updated: 0, resolved: 0 });

    const result = await ragHealthAlertCheckService.runHealthCheck();

    expect(mockComputeRagHealth).toHaveBeenCalledWith('1h');
    expect(mockComputeRagHealth).toHaveBeenCalledWith('24h');
    expect(mockComputeRagHealth).toHaveBeenCalledWith('7d');
    expect(mockApplyDetectedConditions).toHaveBeenCalledWith(expect.any(Array), ['1h', '24h']);
    expect(result.enabled).toBe(true);
  });
});
