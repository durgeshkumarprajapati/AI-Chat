import { RagHealthResult } from './rag-health.service';
import { RagHealthAlertConfig } from './rag-health-alert-config';

/**
 * Pure, deterministic RAG health alert rule evaluation. No LLM, no ML — every condition below is a
 * plain numeric comparison against either a configured threshold or a same-metric baseline window.
 * Imports only types (no env/prisma/config-service dependency), so this is fully unit-testable in
 * isolation, mirroring the graph-comparison-metrics.ts / evidence-attribution.ts precedent
 * established earlier this session for the same reason.
 */

export type DetectedAlertCategory = 'CITATION' | 'GRAPH' | 'RETRIEVAL' | 'RELIABILITY';
export type DetectedAlertSeverity = 'WARNING' | 'CRITICAL';

export interface DetectedCondition {
  category: DetectedAlertCategory;
  metric: string;
  severity: DetectedAlertSeverity;
  detectionReason: string;
  currentValue: number;
  baselineValue?: number;
  thresholdValue?: number;
  window: string;
  sampleSize: number;
  /** Stable per (category, metric, window) — see RagHealthAlert.dedupeKey's own doc comment in
   * schema.prisma for why this isn't a DB-unique constraint. */
  dedupeKey: string;
}

/** Escalation multiplier for threshold-based rules: CRITICAL once the current value is this many
 * times past the configured threshold (relative to how far above zero the threshold itself is),
 * WARNING otherwise. A single, uniformly-applied constant — not a per-rule magic number, and not
 * exposed as its own config knob (the user configures the underlying THRESHOLD; this only decides
 * how far past it counts as critical). */
const CRITICAL_ESCALATION_MULTIPLIER = 1.5;

function thresholdSeverity(currentValue: number, thresholdValue: number): DetectedAlertSeverity {
  return currentValue >= thresholdValue * CRITICAL_ESCALATION_MULTIPLIER ? 'CRITICAL' : 'WARNING';
}

function anomalySeverity(magnitude: number, triggerThreshold: number): DetectedAlertSeverity {
  return magnitude >= triggerThreshold * 2 ? 'CRITICAL' : 'WARNING';
}

function dedupeKey(category: DetectedAlertCategory, metric: string, window: string): string {
  return `${category}:${metric}:${window}`;
}

/**
 * Evaluates every threshold rule (Phase 2) against ONE window's already-computed ragHealth result.
 * `baseline`, when provided, additionally unlocks the anomaly rules (Phase 4) that compare this
 * SAME metric across two windows. Every rule independently checks its own relevant sample count
 * against `config.minSampleSize` before firing — "only compare metrics when sufficient data
 * exists" — so a quiet system never produces a misleading alert from a handful of rows.
 */
export function evaluateRagHealthAlertRules(
  current: RagHealthResult,
  baseline: RagHealthResult | null,
  config: RagHealthAlertConfig
): DetectedCondition[] {
  const conditions: DetectedCondition[] = [];
  const { window } = current;

  // ================= CITATION HEALTH =================
  if (current.citations.available && current.citations.sampleSize >= config.minSampleSize) {
    const s = current.citations;

    if (typeof s.uncitedAnswerRatePercent === 'number' && s.uncitedAnswerRatePercent > config.maxUncitedRatePercent) {
      conditions.push({
        category: 'CITATION', metric: 'uncitedAnswerRatePercent',
        severity: thresholdSeverity(s.uncitedAnswerRatePercent, config.maxUncitedRatePercent),
        detectionReason: `Uncited-answer rate ${s.uncitedAnswerRatePercent}% exceeds the configured maximum of ${config.maxUncitedRatePercent}% (sample of ${s.sampleSize} recent answers).`,
        currentValue: s.uncitedAnswerRatePercent, thresholdValue: config.maxUncitedRatePercent,
        window, sampleSize: s.sampleSize, dedupeKey: dedupeKey('CITATION', 'uncitedAnswerRatePercent', window)
      });
    }

    if (typeof s.invalidReferenceRatePercent === 'number' && s.invalidReferenceRatePercent > config.maxInvalidReferenceRatePercent) {
      conditions.push({
        category: 'CITATION', metric: 'invalidReferenceRatePercent',
        severity: thresholdSeverity(s.invalidReferenceRatePercent, config.maxInvalidReferenceRatePercent),
        detectionReason: `Invalid evidence-reference rate ${s.invalidReferenceRatePercent}% exceeds the configured maximum of ${config.maxInvalidReferenceRatePercent}% (sample of ${s.sampleSize} recent answers).`,
        currentValue: s.invalidReferenceRatePercent, thresholdValue: config.maxInvalidReferenceRatePercent,
        window, sampleSize: s.sampleSize, dedupeKey: dedupeKey('CITATION', 'invalidReferenceRatePercent', window)
      });
    }

    if (typeof s.malformedReferenceRatePercent === 'number' && s.malformedReferenceRatePercent > config.maxMalformedReferenceRatePercent) {
      conditions.push({
        category: 'CITATION', metric: 'malformedReferenceRatePercent',
        severity: thresholdSeverity(s.malformedReferenceRatePercent, config.maxMalformedReferenceRatePercent),
        detectionReason: `Malformed evidence-reference rate ${s.malformedReferenceRatePercent}% exceeds the configured maximum of ${config.maxMalformedReferenceRatePercent}% (sample of ${s.sampleSize} recent answers).`,
        currentValue: s.malformedReferenceRatePercent, thresholdValue: config.maxMalformedReferenceRatePercent,
        window, sampleSize: s.sampleSize, dedupeKey: dedupeKey('CITATION', 'malformedReferenceRatePercent', window)
      });
    }

    // Attribution quality degradation — an anomaly (change vs baseline), not an absolute
    // threshold, since "degradation" is inherently relative. Uses the share of the worst
    // deterministic bucket (INVALID_REFERENCES_PRESENT) in the distribution.
    if (baseline?.citations.available && baseline.citations.sampleSize >= config.minSampleSize) {
      const currentBadShare = ((current.citations.attributionQualityDistribution?.INVALID_REFERENCES_PRESENT ?? 0) / current.citations.sampleSize) * 100;
      const baselineBadShare = ((baseline.citations.attributionQualityDistribution?.INVALID_REFERENCES_PRESENT ?? 0) / baseline.citations.sampleSize) * 100;
      const increase = currentBadShare - baselineBadShare;
      if (increase > config.rateAnomalyIncreasePoints) {
        conditions.push({
          category: 'CITATION', metric: 'attributionQualityDegradation',
          severity: anomalySeverity(increase, config.rateAnomalyIncreasePoints),
          detectionReason: `Share of answers with INVALID_REFERENCES_PRESENT attribution quality rose from ${Number(baselineBadShare.toFixed(1))}% (baseline) to ${Number(currentBadShare.toFixed(1))}% (current), a ${Number(increase.toFixed(1))}-point increase exceeding the configured ${config.rateAnomalyIncreasePoints}-point trigger.`,
          currentValue: Number(currentBadShare.toFixed(1)), baselineValue: Number(baselineBadShare.toFixed(1)),
          window, sampleSize: current.citations.sampleSize, dedupeKey: dedupeKey('CITATION', 'attributionQualityDegradation', window)
        });
      }
    }
  }

  // ================= GRAPHRAG HEALTH =================
  if (current.graph.available && typeof current.graph.graphExecutedCount === 'number' && current.graph.graphExecutedCount >= config.minSampleSize) {
    const g = current.graph;
    const failureRatePercent = g.graphExecutedCount! > 0 ? Number(((g.graphFailureCount ?? 0) / g.graphExecutedCount! * 100).toFixed(1)) : 0;

    if (failureRatePercent > config.maxGraphFailureRatePercent) {
      conditions.push({
        category: 'GRAPH', metric: 'graphFailureRatePercent',
        severity: thresholdSeverity(failureRatePercent, config.maxGraphFailureRatePercent),
        detectionReason: `Graph retrieval failure rate ${failureRatePercent}% exceeds the configured maximum of ${config.maxGraphFailureRatePercent}% (${g.graphExecutedCount} executed attempts sampled).`,
        currentValue: failureRatePercent, thresholdValue: config.maxGraphFailureRatePercent,
        window, sampleSize: g.graphExecutedCount!, dedupeKey: dedupeKey('GRAPH', 'graphFailureRatePercent', window)
      });
    }

    if (typeof g.avgGraphLatencyMs === 'number' && g.avgGraphLatencyMs > config.maxGraphLatencyMs) {
      conditions.push({
        category: 'GRAPH', metric: 'avgGraphLatencyMs',
        severity: thresholdSeverity(g.avgGraphLatencyMs, config.maxGraphLatencyMs),
        detectionReason: `Average graph retrieval latency ${g.avgGraphLatencyMs}ms exceeds the configured maximum of ${config.maxGraphLatencyMs}ms (${g.graphExecutedCount} executed attempts sampled).`,
        currentValue: g.avgGraphLatencyMs, thresholdValue: config.maxGraphLatencyMs,
        window, sampleSize: g.graphExecutedCount!, dedupeKey: dedupeKey('GRAPH', 'avgGraphLatencyMs', window)
      });
    }

    if (typeof g.graphUniqueContributionRatePercent === 'number' && g.graphUniqueContributionRatePercent < config.minGraphContributionRatePercent) {
      conditions.push({
        category: 'GRAPH', metric: 'graphUniqueContributionRatePercent',
        severity: 'WARNING',
        detectionReason: `Graph retrieval is executing but its unique-contribution rate (${g.graphUniqueContributionRatePercent}%) is below the configured minimum of ${config.minGraphContributionRatePercent}% — graph augmentation is running yet adding almost no non-duplicate evidence (${g.graphExecutedCount} executed attempts sampled). This does not measure or claim anything about final answer quality — see graph-comparison.service.ts for that distinct, offline evaluation.`,
        currentValue: g.graphUniqueContributionRatePercent, thresholdValue: config.minGraphContributionRatePercent,
        window, sampleSize: g.graphExecutedCount!, dedupeKey: dedupeKey('GRAPH', 'graphUniqueContributionRatePercent', window)
      });
    }

    // Graph success rate unexpectedly low vs baseline (anomaly, distinct from the absolute
    // failure-rate threshold above — this fires even when failures are still under the absolute
    // threshold but have clearly worsened relative to how this system normally behaves).
    if (baseline?.graph.available && typeof baseline.graph.graphExecutedCount === 'number' && baseline.graph.graphExecutedCount >= config.minSampleSize
      && typeof current.graph.graphSuccessRatePercent === 'number' && typeof baseline.graph.graphSuccessRatePercent === 'number') {
      const drop = baseline.graph.graphSuccessRatePercent - current.graph.graphSuccessRatePercent;
      if (drop > config.rateAnomalyIncreasePoints) {
        conditions.push({
          category: 'GRAPH', metric: 'graphSuccessRateAnomaly',
          severity: anomalySeverity(drop, config.rateAnomalyIncreasePoints),
          detectionReason: `Graph retrieval success rate dropped from ${baseline.graph.graphSuccessRatePercent}% (baseline) to ${current.graph.graphSuccessRatePercent}% (current), a ${Number(drop.toFixed(1))}-point decrease exceeding the configured ${config.rateAnomalyIncreasePoints}-point trigger.`,
          currentValue: current.graph.graphSuccessRatePercent, baselineValue: baseline.graph.graphSuccessRatePercent,
          window, sampleSize: g.graphExecutedCount!, dedupeKey: dedupeKey('GRAPH', 'graphSuccessRateAnomaly', window)
        });
      }
    }
  }

  // ================= RETRIEVAL PERFORMANCE =================
  if (current.retrieval.available && current.overview.totalRequests >= config.minSampleSize) {
    if (typeof current.retrieval.avgRetrievalLatencyMs === 'number' && current.retrieval.avgRetrievalLatencyMs > config.maxRetrievalLatencyMs) {
      conditions.push({
        category: 'RETRIEVAL', metric: 'avgRetrievalLatencyMs',
        severity: thresholdSeverity(current.retrieval.avgRetrievalLatencyMs, config.maxRetrievalLatencyMs),
        detectionReason: `Average retrieval latency ${current.retrieval.avgRetrievalLatencyMs}ms exceeds the configured maximum of ${config.maxRetrievalLatencyMs}ms (${current.overview.totalRequests} requests in window).`,
        currentValue: current.retrieval.avgRetrievalLatencyMs, thresholdValue: config.maxRetrievalLatencyMs,
        window, sampleSize: current.overview.totalRequests, dedupeKey: dedupeKey('RETRIEVAL', 'avgRetrievalLatencyMs', window)
      });
    }

    if (typeof current.overview.avgTotalLatencyMs === 'number' && current.overview.avgTotalLatencyMs > config.maxTotalLatencyMs) {
      conditions.push({
        category: 'RETRIEVAL', metric: 'avgTotalLatencyMs',
        severity: thresholdSeverity(current.overview.avgTotalLatencyMs, config.maxTotalLatencyMs),
        detectionReason: `Average total RAG request latency ${current.overview.avgTotalLatencyMs}ms exceeds the configured maximum of ${config.maxTotalLatencyMs}ms (${current.overview.totalRequests} requests in window).`,
        currentValue: current.overview.avgTotalLatencyMs, thresholdValue: config.maxTotalLatencyMs,
        window, sampleSize: current.overview.totalRequests, dedupeKey: dedupeKey('RETRIEVAL', 'avgTotalLatencyMs', window)
      });
    }

    if (baseline?.retrieval.available && baseline.overview.totalRequests >= config.minSampleSize) {
      for (const [metric, currentMs, baselineMs] of [
        ['avgRetrievalLatencyMsAnomaly', current.retrieval.avgRetrievalLatencyMs, baseline.retrieval.avgRetrievalLatencyMs],
        ['avgTotalLatencyMsAnomaly', current.overview.avgTotalLatencyMs, baseline.overview.avgTotalLatencyMs]
      ] as const) {
        if (typeof currentMs !== 'number' || typeof baselineMs !== 'number' || baselineMs <= 0) continue;
        const increasePercent = ((currentMs - baselineMs) / baselineMs) * 100;
        if (increasePercent > config.latencyAnomalyIncreasePercent) {
          conditions.push({
            category: 'RETRIEVAL', metric,
            severity: anomalySeverity(increasePercent, config.latencyAnomalyIncreasePercent),
            detectionReason: `${metric === 'avgRetrievalLatencyMsAnomaly' ? 'Retrieval' : 'Total RAG'} latency increased from ${baselineMs}ms (baseline) to ${currentMs}ms (current), a ${Number(increasePercent.toFixed(1))}% relative increase exceeding the configured ${config.latencyAnomalyIncreasePercent}% trigger.`,
            currentValue: currentMs, baselineValue: baselineMs,
            window, sampleSize: current.overview.totalRequests, dedupeKey: dedupeKey('RETRIEVAL', metric, window)
          });
        }
      }
    }
  }

  // ================= REQUEST RELIABILITY =================
  // Deliberately NOT sample-size-gated on totalRequests: a failed request never produces a
  // RagEvaluation row (chat.service.ts throws before persistence), so a real outage could show
  // very few successful requests alongside many failures — gating on totalRequests would mask
  // exactly the incident this rule exists to catch. This is a raw in-memory COUNT, not a rate.
  if (current.failures.requestFailureCount > config.maxRequestFailureCount) {
    conditions.push({
      category: 'RELIABILITY', metric: 'requestFailureCount',
      severity: thresholdSeverity(current.failures.requestFailureCount, config.maxRequestFailureCount),
      detectionReason: `Request failure count ${current.failures.requestFailureCount} exceeds the configured maximum of ${config.maxRequestFailureCount}. This count is in-memory and since-process-start only (${current.failures.requestFailureCountScope}) — it resets on restart/deploy and is NOT a durable historical metric.`,
      currentValue: current.failures.requestFailureCount, thresholdValue: config.maxRequestFailureCount,
      window, sampleSize: current.overview.totalRequests, dedupeKey: dedupeKey('RELIABILITY', 'requestFailureCount', window)
    });
  }

  return conditions;
}
