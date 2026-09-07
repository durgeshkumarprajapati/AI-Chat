import { ragHealthAlertCheckService } from '@/features/rag/evaluation/rag-health-alert-check.service';

/**
 * Periodic RAG health check — deterministic threshold + baseline-anomaly detection over the
 * existing ragHealth aggregation (no LLM, no ML). A no-op while RAG_HEALTH_ALERTS_ENABLED=false
 * (checked inside ragHealthAlertCheckService.runHealthCheck itself, matching this worker's
 * existing billing-reconciliation.processor.ts convention of "the domain service owns its own
 * feature-flag gate, the processor is a thin wrapper"). Runs entirely outside any chat request
 * path — only bounded, indexed RagEvaluation queries (see rag-health.service.ts), no chat/LLM
 * calls of any kind.
 */
export class RagHealthAlertProcessor {
  public async run(): Promise<{ enabled: boolean; created?: number; updated?: number; resolved?: number }> {
    return ragHealthAlertCheckService.runHealthCheck();
  }
}

export const ragHealthAlertProcessor = new RagHealthAlertProcessor();
