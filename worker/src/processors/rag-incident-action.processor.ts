import { RagIncidentActionJobPayload } from '@/lib/rabbitmq';
import { ragHealthAlertCheckService } from '@/features/rag/evaluation/rag-health-alert-check.service';
import { auditService } from '@/features/audit/audit.service';
import { runWithSchedulerLock } from '../lib/scheduler-lock';

export type ProcessingResultAction = 'PERMANENT_ERROR';

export interface ProcessingResult {
  status: 'SUCCESS' | 'STALE_DISCARD' | 'FAILED';
  action?: ProcessingResultAction;
}

const AUDIT_ACTION_NAME = 'RAG_INCIDENT_ACTION';
const AUDIT_TARGET_TYPE = 'RagHealthAlert';

/**
 * Worker processor for the one RAG incident action that must run in-process here rather than
 * inline in the admin API request: RERUN_HEALTH_EVALUATION is guarded by the SAME
 * 'rag-health-check' distributed lock the periodic scheduler tick (worker/src/index.ts) already
 * uses, so a manual/follow-up trigger and the periodic tick can never race or double-process the
 * same alerts. Never resolves an incident directly — runHealthCheck's own
 * applyDetectedConditions/auto-resolution logic (unmodified) is the only thing that can do that.
 * Single-attempt best-effort: always acks (never nacks/requeues) — safe because re-running the
 * health check is itself idempotent and harmless, so a failed attempt simply means the admin can
 * click the action again rather than needing an automatic retry loop.
 */
export class RagIncidentActionProcessor {
  public async process(job: RagIncidentActionJobPayload): Promise<ProcessingResult> {
    if (job.jobType !== 'RAG_INCIDENT_ACTION' || job.actionType !== 'RERUN_HEALTH_EVALUATION') {
      console.warn(`[Worker-RagIncidentAction] Invalid or unsupported job payload: ${JSON.stringify(job)}`);
      return { status: 'STALE_DISCARD' };
    }

    try {
      let resultSummary = 'Health evaluation skipped — already running elsewhere.';
      const lockResult = await runWithSchedulerLock('rag-health-check', 60, async () => {
        const result = await ragHealthAlertCheckService.runHealthCheck();
        resultSummary = result.enabled
          ? `Health evaluation completed: ${result.created ?? 0} created, ${result.updated ?? 0} updated, ${result.resolved ?? 0} resolved.`
          : 'Health evaluation is disabled (RAG_HEALTH_ALERTS_ENABLED=false).';
      });

      if (!lockResult.ran && lockResult.reason === 'LOCK_HELD_SKIP') {
        resultSummary = 'Health evaluation skipped — a run was already in progress (likely the periodic scheduler); alert state already reflects the most recent run.';
      }

      await auditService.logEvent({
        actorId: job.initiatedBy,
        action: AUDIT_ACTION_NAME,
        targetType: AUDIT_TARGET_TYPE,
        targetId: job.alertId,
        details: { requestId: job.requestId, actionType: job.actionType, status: 'SUCCEEDED', resultSummary, trigger: job.trigger }
      });
      console.log(`[Worker-RagIncidentAction] ${job.actionType} for alert ${job.alertId}: SUCCEEDED (${lockResult.reason}).`);
      return { status: 'SUCCESS' };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[Worker-RagIncidentAction] Job failed for alert ${job.alertId}:`, errorMessage);
      await auditService.logEvent({
        actorId: job.initiatedBy,
        action: AUDIT_ACTION_NAME,
        targetType: AUDIT_TARGET_TYPE,
        targetId: job.alertId,
        details: { requestId: job.requestId, actionType: job.actionType, status: 'FAILED', resultSummary: 'Action failed. See server logs for details.', trigger: job.trigger }
      });
      return { status: 'FAILED', action: 'PERMANENT_ERROR' };
    }
  }
}

export const ragIncidentActionProcessor = new RagIncidentActionProcessor();
