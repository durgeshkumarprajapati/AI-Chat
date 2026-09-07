import { configService } from '@/features/config';

/**
 * Single centralized read of every RAG health alert threshold/config value — every value here is
 * registered in config.registry.ts under the RAG category (RAG_HEALTH_*), reusing the existing
 * DB-backed, cached, admin-editable config architecture (no static env var, no magic numbers
 * scattered through the detection logic). Every `configService.getNumber/getBoolean` call already
 * falls back safely to the conservative default below if no DB row or registry entry existed, so
 * this never throws.
 */
export interface RagHealthAlertConfig {
  enabled: boolean;
  checkIntervalMs: number;
  minSampleSize: number;
  maxUncitedRatePercent: number;
  maxInvalidReferenceRatePercent: number;
  maxMalformedReferenceRatePercent: number;
  maxGraphFailureRatePercent: number;
  maxGraphLatencyMs: number;
  minGraphContributionRatePercent: number;
  maxRetrievalLatencyMs: number;
  maxTotalLatencyMs: number;
  maxRequestFailureCount: number;
  latencyAnomalyIncreasePercent: number;
  rateAnomalyIncreasePoints: number;
}

export async function loadRagHealthAlertConfig(): Promise<RagHealthAlertConfig> {
  const [
    enabled,
    checkIntervalMs,
    minSampleSize,
    maxUncitedRatePercent,
    maxInvalidReferenceRatePercent,
    maxMalformedReferenceRatePercent,
    maxGraphFailureRatePercent,
    maxGraphLatencyMs,
    minGraphContributionRatePercent,
    maxRetrievalLatencyMs,
    maxTotalLatencyMs,
    maxRequestFailureCount,
    latencyAnomalyIncreasePercent,
    rateAnomalyIncreasePoints
  ] = await Promise.all([
    configService.getBoolean('RAG_HEALTH_ALERTS_ENABLED', false),
    configService.getNumber('RAG_HEALTH_CHECK_INTERVAL_MS', 900000),
    configService.getNumber('RAG_HEALTH_MIN_SAMPLE_SIZE', 20),
    configService.getNumber('RAG_HEALTH_MAX_UNCITED_RATE_PERCENT', 40),
    configService.getNumber('RAG_HEALTH_MAX_INVALID_REFERENCE_RATE_PERCENT', 15),
    configService.getNumber('RAG_HEALTH_MAX_MALFORMED_REFERENCE_RATE_PERCENT', 15),
    configService.getNumber('RAG_HEALTH_MAX_GRAPH_FAILURE_RATE_PERCENT', 30),
    configService.getNumber('RAG_HEALTH_MAX_GRAPH_LATENCY_MS', 3000),
    configService.getNumber('RAG_HEALTH_MIN_GRAPH_CONTRIBUTION_RATE_PERCENT', 5),
    configService.getNumber('RAG_HEALTH_MAX_RETRIEVAL_LATENCY_MS', 3000),
    configService.getNumber('RAG_HEALTH_MAX_TOTAL_LATENCY_MS', 8000),
    configService.getNumber('RAG_HEALTH_MAX_REQUEST_FAILURE_COUNT', 20),
    configService.getNumber('RAG_HEALTH_LATENCY_ANOMALY_INCREASE_PERCENT', 50),
    configService.getNumber('RAG_HEALTH_RATE_ANOMALY_INCREASE_POINTS', 15)
  ]);

  return {
    enabled,
    checkIntervalMs,
    minSampleSize,
    maxUncitedRatePercent,
    maxInvalidReferenceRatePercent,
    maxMalformedReferenceRatePercent,
    maxGraphFailureRatePercent,
    maxGraphLatencyMs,
    minGraphContributionRatePercent,
    maxRetrievalLatencyMs,
    maxTotalLatencyMs,
    maxRequestFailureCount,
    latencyAnomalyIncreasePercent,
    rateAnomalyIncreasePoints
  };
}
