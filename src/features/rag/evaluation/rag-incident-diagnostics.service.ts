import { RagHealthAlert } from '@prisma/client';
import { ragHealthService, isRagHealthTimeWindow } from './rag-health.service';

export interface RagIncidentDiagnostics {
  // Directly from the alert row — already-persisted operational fields, re-exposed here purely
  // for a single "diagnostics" view (no new computation).
  currentValue: number;
  baselineValue: number | null;
  thresholdValue: number | null;
  sampleSize: number;
  window: string;
  detectionCount: number;
  alertDurationMs: number;
  // Derived, live, from the SAME ragHealthService aggregation already used by detection/the
  // performance page — never a second health calculation. Each is `null` when unavailable
  // (e.g. the alert's own `window` isn't a recognized RagHealthTimeWindow, or that window's
  // aggregation itself reports unavailable) — never fabricated.
  totalLatencyMs: number | null;
  retrievalLatencyMs: number | null;
  graphAttemptedRatePercent: number | null;
  graphSuccessRatePercent: number | null;
  citationAttributionQualityDistribution: Record<string, number> | null;
  requestFailureCount: number | null;
}

/**
 * Read-only, derived-only diagnostics for a single RAG incident. Reuses ragHealthService's
 * existing aggregation (already used by detection and /api/admin/performance) — introduces no new
 * health calculation. Never throws: any lookup failure degrades individual fields to `null` rather
 * than fabricating a value or breaking the incident detail response.
 */
export class RagIncidentDiagnosticsService {
  public async getDiagnostics(alert: RagHealthAlert): Promise<RagIncidentDiagnostics> {
    const base: RagIncidentDiagnostics = {
      currentValue: alert.currentValue,
      baselineValue: alert.baselineValue,
      thresholdValue: alert.thresholdValue,
      sampleSize: alert.sampleSize,
      window: alert.window,
      detectionCount: alert.detectionCount,
      alertDurationMs: (alert.resolvedAt ?? new Date()).getTime() - alert.firstDetectedAt.getTime(),
      totalLatencyMs: null,
      retrievalLatencyMs: null,
      graphAttemptedRatePercent: null,
      graphSuccessRatePercent: null,
      citationAttributionQualityDistribution: null,
      requestFailureCount: null
    };

    if (!isRagHealthTimeWindow(alert.window)) {
      return base;
    }

    try {
      const health = await ragHealthService.computeRagHealth(alert.window);
      return {
        ...base,
        totalLatencyMs: health.overview.available ? health.overview.avgTotalLatencyMs : null,
        retrievalLatencyMs: health.retrieval.available ? health.retrieval.avgRetrievalLatencyMs : null,
        graphAttemptedRatePercent: health.graph.available ? health.graph.graphAttemptedRatePercent ?? null : null,
        graphSuccessRatePercent: health.graph.available ? health.graph.graphSuccessRatePercent ?? null : null,
        citationAttributionQualityDistribution: health.citations.available ? health.citations.attributionQualityDistribution ?? null : null,
        requestFailureCount: health.overview.available ? health.overview.requestFailureCount : null
      };
    } catch (err) {
      console.error(`[RagIncidentDiagnosticsService] Health aggregation failed for alert ${alert.id}:`, err instanceof Error ? err.message : err);
      return base;
    }
  }
}

export const ragIncidentDiagnosticsService = new RagIncidentDiagnosticsService();
