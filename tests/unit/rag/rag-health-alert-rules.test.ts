import { evaluateRagHealthAlertRules } from '@/features/rag/evaluation/rag-health-alert-rules';
import { RagHealthResult, RagHealthTimeWindow } from '@/features/rag/evaluation/rag-health.service';
import { RagHealthAlertConfig } from '@/features/rag/evaluation/rag-health-alert-config';

/**
 * Pure-function tests — imports only types, no env/prisma/config-service dependency, so this runs
 * fully in this sandbox (mirrors the graph-comparison-metrics.ts / evidence-attribution.ts
 * precedent from earlier this session).
 */

const CONFIG: RagHealthAlertConfig = {
  enabled: true,
  checkIntervalMs: 900000,
  minSampleSize: 20,
  maxUncitedRatePercent: 40,
  maxInvalidReferenceRatePercent: 15,
  maxMalformedReferenceRatePercent: 15,
  maxGraphFailureRatePercent: 30,
  maxGraphLatencyMs: 3000,
  minGraphContributionRatePercent: 5,
  maxRetrievalLatencyMs: 3000,
  maxTotalLatencyMs: 8000,
  maxRequestFailureCount: 20,
  latencyAnomalyIncreasePercent: 50,
  rateAnomalyIncreasePoints: 15
};

function healthyResult(window: RagHealthTimeWindow, overrides: Partial<RagHealthResult> = {}): RagHealthResult {
  return {
    window,
    overview: { available: true, totalRequests: 100, fallbackCount: 2, fallbackRate: 2, requestFailureCount: 0, avgTotalLatencyMs: 1000 },
    retrieval: { available: true, avgRetrievalLatencyMs: 500, avgRetrievedChunkCount: 4, zeroChunkRatePercent: null, cacheHitRate: { available: false, reason: 'no data' } },
    graph: {
      available: true, sampleSize: 100, sampleCoveragePercent: 100, applicableRequestCount: 50,
      graphEnabledRatePercent: 100, graphAttemptedRatePercent: 100, graphExecutedCount: 40,
      graphSuccessRatePercent: 95, graphFailureCount: 2, avgGraphLatencyMs: 200,
      avgGraphChunksAdded: 1.2, avgGraphChunksDroppedByLimit: 0, graphUniqueContributionRatePercent: 60
    },
    citations: {
      available: true, sampleSize: 100, sampleCoveragePercent: 100,
      avgReferencedEvidenceCount: 1.5, avgRetrievedEvidenceCount: 3,
      attributionQualityDistribution: { VALID_REFERENCES: 90, NO_REFERENCES: 10 },
      uncitedAnswerRatePercent: 10, invalidReferenceRatePercent: 2, malformedReferenceRatePercent: 1,
      duplicateReferenceRatePercent: 1, avgDocumentCitationCount: 1.2, avgGraphCitationCount: 0.3,
      graphCitationRatioPercent: 20
    },
    failures: { requestFailureCount: 0, requestFailureCountScope: 'in_memory_since_process_start', llmGenerationFailureCount: null, retrievalFailureCount: null },
    limitations: [],
    ...overrides
  };
}

describe('evaluateRagHealthAlertRules', () => {
  it('1. produces no conditions when every metric is healthy', () => {
    const result = evaluateRagHealthAlertRules(healthyResult('24h'), null, CONFIG);
    expect(result).toEqual([]);
  });

  it('2. fires an uncited-answer alert when the rate exceeds the threshold', () => {
    const current = healthyResult('24h', { citations: { ...healthyResult('24h').citations, uncitedAnswerRatePercent: 55 } });
    const result = evaluateRagHealthAlertRules(current, null, CONFIG);

    const alert = result.find((c) => c.metric === 'uncitedAnswerRatePercent');
    expect(alert).toBeDefined();
    expect(alert?.category).toBe('CITATION');
    expect(alert?.currentValue).toBe(55);
    expect(alert?.thresholdValue).toBe(40);
    expect(alert?.dedupeKey).toBe('CITATION:uncitedAnswerRatePercent:24h');
  });

  it('escalates to CRITICAL once the value is 1.5x past the threshold', () => {
    const current = healthyResult('24h', { citations: { ...healthyResult('24h').citations, uncitedAnswerRatePercent: 61 } }); // 40 * 1.5 = 60
    const result = evaluateRagHealthAlertRules(current, null, CONFIG);
    expect(result.find((c) => c.metric === 'uncitedAnswerRatePercent')?.severity).toBe('CRITICAL');
  });

  it('3. fires an invalid-reference alert when the rate exceeds the threshold', () => {
    const current = healthyResult('24h', { citations: { ...healthyResult('24h').citations, invalidReferenceRatePercent: 20 } });
    const result = evaluateRagHealthAlertRules(current, null, CONFIG);
    expect(result.find((c) => c.metric === 'invalidReferenceRatePercent')).toBeDefined();
  });

  it('4. fires a malformed-reference alert when the rate exceeds the threshold', () => {
    const current = healthyResult('24h', { citations: { ...healthyResult('24h').citations, malformedReferenceRatePercent: 20 } });
    const result = evaluateRagHealthAlertRules(current, null, CONFIG);
    expect(result.find((c) => c.metric === 'malformedReferenceRatePercent')).toBeDefined();
  });

  it('5. fires a graph-failure alert when the failure rate exceeds the threshold', () => {
    const current = healthyResult('24h', {
      graph: { ...healthyResult('24h').graph, graphExecutedCount: 40, graphFailureCount: 20 } // 50%
    });
    const result = evaluateRagHealthAlertRules(current, null, CONFIG);
    const alert = result.find((c) => c.metric === 'graphFailureRatePercent');
    expect(alert).toBeDefined();
    expect(alert?.category).toBe('GRAPH');
    expect(alert?.currentValue).toBe(50);
  });

  it('6. fires a retrieval-latency alert when it exceeds the threshold', () => {
    const current = healthyResult('24h', { retrieval: { ...healthyResult('24h').retrieval, avgRetrievalLatencyMs: 5000 } });
    const result = evaluateRagHealthAlertRules(current, null, CONFIG);
    expect(result.find((c) => c.metric === 'avgRetrievalLatencyMs' && c.category === 'RETRIEVAL')).toBeDefined();
  });

  it('7. fires a total-latency alert when it exceeds the threshold', () => {
    const current = healthyResult('24h', { overview: { ...healthyResult('24h').overview, avgTotalLatencyMs: 12000 } });
    const result = evaluateRagHealthAlertRules(current, null, CONFIG);
    expect(result.find((c) => c.metric === 'avgTotalLatencyMs')).toBeDefined();
  });

  it('8. insufficient sample data (below minSampleSize) never triggers a citation alert', () => {
    const current = healthyResult('24h', { citations: { ...healthyResult('24h').citations, sampleSize: 5, uncitedAnswerRatePercent: 90 } });
    const result = evaluateRagHealthAlertRules(current, null, CONFIG);
    expect(result.find((c) => c.metric === 'uncitedAnswerRatePercent')).toBeUndefined();
  });

  it('8b. insufficient graph-executed count never triggers a graph alert', () => {
    const current = healthyResult('24h', { graph: { ...healthyResult('24h').graph, graphExecutedCount: 3, graphFailureCount: 3 } });
    const result = evaluateRagHealthAlertRules(current, null, CONFIG);
    expect(result.find((c) => c.metric === 'graphFailureRatePercent')).toBeUndefined();
  });

  it('8c. insufficient overview sample never triggers a retrieval/latency alert', () => {
    const current = healthyResult('24h', {
      overview: { ...healthyResult('24h').overview, totalRequests: 3, avgTotalLatencyMs: 20000 },
      retrieval: { ...healthyResult('24h').retrieval, avgRetrievalLatencyMs: 20000 }
    });
    const result = evaluateRagHealthAlertRules(current, null, CONFIG);
    expect(result.find((c) => c.category === 'RETRIEVAL')).toBeUndefined();
  });

  it('9. a zero/undefined baseline never causes a division error for latency anomalies', () => {
    const current = healthyResult('24h', { retrieval: { ...healthyResult('24h').retrieval, avgRetrievalLatencyMs: 5000 } });
    const baseline = healthyResult('7d', { retrieval: { ...healthyResult('7d').retrieval, avgRetrievalLatencyMs: 0 } });
    expect(() => evaluateRagHealthAlertRules(current, baseline, CONFIG)).not.toThrow();
    const result = evaluateRagHealthAlertRules(current, baseline, CONFIG);
    expect(result.some((c) => c.metric === 'avgRetrievalLatencyMsAnomaly')).toBe(false);
  });

  it('fires a latency anomaly when current exceeds baseline by more than the configured relative percent', () => {
    const current = healthyResult('1h', { retrieval: { ...healthyResult('1h').retrieval, avgRetrievalLatencyMs: 1000 }, overview: { ...healthyResult('1h').overview, totalRequests: 100 } });
    const baseline = healthyResult('24h', { retrieval: { ...healthyResult('24h').retrieval, avgRetrievalLatencyMs: 500 }, overview: { ...healthyResult('24h').overview, totalRequests: 100 } }); // 100% increase > 50%
    const result = evaluateRagHealthAlertRules(current, baseline, CONFIG);
    expect(result.find((c) => c.metric === 'avgRetrievalLatencyMsAnomaly')).toBeDefined();
  });

  it('does not fire a latency anomaly for a small, insignificant fluctuation', () => {
    const current = healthyResult('1h', { retrieval: { ...healthyResult('1h').retrieval, avgRetrievalLatencyMs: 520 }, overview: { ...healthyResult('1h').overview, totalRequests: 100 } });
    const baseline = healthyResult('24h', { retrieval: { ...healthyResult('24h').retrieval, avgRetrievalLatencyMs: 500 }, overview: { ...healthyResult('24h').overview, totalRequests: 100 } }); // 4% increase
    const result = evaluateRagHealthAlertRules(current, baseline, CONFIG);
    expect(result.find((c) => c.metric === 'avgRetrievalLatencyMsAnomaly')).toBeUndefined();
  });

  it('fires a graph success-rate anomaly when it drops relative to baseline beyond the point threshold', () => {
    const current = healthyResult('1h', { graph: { ...healthyResult('1h').graph, graphExecutedCount: 30, graphSuccessRatePercent: 70 } });
    const baseline = healthyResult('24h', { graph: { ...healthyResult('24h').graph, graphExecutedCount: 30, graphSuccessRatePercent: 95 } });
    const result = evaluateRagHealthAlertRules(current, baseline, CONFIG);
    expect(result.find((c) => c.metric === 'graphSuccessRateAnomaly')).toBeDefined();
  });

  it('fires an attribution-quality degradation anomaly when INVALID_REFERENCES_PRESENT share rises', () => {
    const current = healthyResult('1h', {
      citations: { ...healthyResult('1h').citations, sampleSize: 100, attributionQualityDistribution: { VALID_REFERENCES: 60, INVALID_REFERENCES_PRESENT: 40 } }
    });
    const baseline = healthyResult('24h', {
      citations: { ...healthyResult('24h').citations, sampleSize: 100, attributionQualityDistribution: { VALID_REFERENCES: 95, INVALID_REFERENCES_PRESENT: 5 } }
    });
    const result = evaluateRagHealthAlertRules(current, baseline, CONFIG);
    expect(result.find((c) => c.metric === 'attributionQualityDegradation')).toBeDefined();
  });

  it('graph unique-contribution rule fires when graph runs but contributes near-zero evidence', () => {
    const current = healthyResult('24h', { graph: { ...healthyResult('24h').graph, graphExecutedCount: 40, graphUniqueContributionRatePercent: 1 } });
    const result = evaluateRagHealthAlertRules(current, null, CONFIG);
    const alert = result.find((c) => c.metric === 'graphUniqueContributionRatePercent');
    expect(alert).toBeDefined();
    expect(alert?.detectionReason).not.toMatch(/answer quality is (worse|bad|poor)/i);
  });

  it('14. never includes any question/answer/document-content-shaped field in a detected condition', () => {
    const current = healthyResult('24h', { citations: { ...healthyResult('24h').citations, uncitedAnswerRatePercent: 90 } });
    const conditions = evaluateRagHealthAlertRules(current, null, CONFIG);
    for (const c of conditions) {
      expect(Object.keys(c)).not.toEqual(expect.arrayContaining(['question', 'answer', 'documentContent', 'entityId']));
    }
  });

  it('the reliability rule is not gated on overview sample size (a real outage may have few successes)', () => {
    const current = healthyResult('24h', {
      overview: { ...healthyResult('24h').overview, totalRequests: 1 },
      failures: { requestFailureCount: 25, requestFailureCountScope: 'in_memory_since_process_start', llmGenerationFailureCount: null, retrievalFailureCount: null }
    });
    const result = evaluateRagHealthAlertRules(current, null, CONFIG);
    const alert = result.find((c) => c.metric === 'requestFailureCount');
    expect(alert).toBeDefined();
    expect(alert?.detectionReason).toContain('in-memory');
  });
});
