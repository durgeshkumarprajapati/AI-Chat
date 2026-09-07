import { randomUUID } from 'crypto';
import { rabbitmq, QUEUES, RagIncidentActionJobPayload } from '@/lib/rabbitmq';
import { auditService } from '@/features/audit/audit.service';
import { configCacheService } from '@/features/config';
import { getRAGCacheProvider } from '@/features/rag/cache/rag-cache.factory';
import { getActionDefinition } from './rag-incident-action.registry';
import { RagIncidentActionResult, RagIncidentActionType } from './rag-incident-action.types';

const AUDIT_ACTION_NAME = 'RAG_INCIDENT_ACTION';
const AUDIT_TARGET_TYPE = 'RagHealthAlert';

/**
 * Executes an allow-listed RAG incident operational action. There is no generic "run arbitrary
 * action" entry point — `actionType` is validated against RAG_INCIDENT_ACTIONS (the strict
 * allow-list) before anything else happens, and an unknown value is rejected immediately.
 *
 * Reuses existing infrastructure end to end:
 *  - Audit trail: the existing, unmodified auditService.logEvent() (its own sanitizeMetadata
 *    already redacts anything matching password/secret/token/apiKey/credential patterns).
 *  - Background execution: the existing RabbitMQ queue/worker pattern, for the one action that
 *    must run inside the worker process (to share the periodic health-check's distributed lock).
 *  - Cache invalidation: the existing RAGCacheProvider/configCacheService — no new Redis logic.
 *
 * Never modifies alert lifecycle status — that remains exclusively owned by
 * rag-health-alert.service.ts's applyDetectedConditions/acknowledgeAlert.
 */
export class RagIncidentActionService {
  public async executeAction(
    actionType: string,
    alertId: string,
    actorId: string,
    trigger: 'MANUAL' | 'AUTOMATIC_FOLLOW_UP' = 'MANUAL'
  ): Promise<RagIncidentActionResult> {
    const definition = getActionDefinition(actionType);
    if (!definition) {
      return { requestId: randomUUID(), actionType: actionType as RagIncidentActionType, status: 'FAILED', resultSummary: 'Unknown action type.' };
    }

    const requestId = randomUUID();

    if (definition.backgroundExecutionRequired) {
      return this.executeBackgroundAction(definition.actionType, alertId, actorId, requestId, trigger);
    }
    return this.executeSyncAction(definition.actionType, alertId, actorId, requestId);
  }

  private async executeSyncAction(
    actionType: RagIncidentActionType,
    alertId: string,
    actorId: string,
    requestId: string
  ): Promise<RagIncidentActionResult> {
    try {
      const resultSummary = await this.runSyncAction(actionType);
      await this.logAction(actorId, alertId, { requestId, actionType, status: 'SUCCEEDED', resultSummary });
      // Phase 11 — best-effort follow-up re-evaluation; never blocks or affects this action's own
      // result, and never itself forces a RESOLVED status (only the existing detection lifecycle
      // can do that).
      this.enqueueFollowUpHealthCheck(alertId, actorId).catch(() => {});
      return { requestId, actionType, status: 'SUCCEEDED', resultSummary };
    } catch (err) {
      console.error(`[RagIncidentActionService] Action ${actionType} failed for alert ${alertId}:`, err instanceof Error ? err.message : err);
      const resultSummary = 'Action failed. See server logs for details.';
      await this.logAction(actorId, alertId, { requestId, actionType, status: 'FAILED', resultSummary });
      return { requestId, actionType, status: 'FAILED', resultSummary };
    }
  }

  private async runSyncAction(actionType: RagIncidentActionType): Promise<string> {
    switch (actionType) {
      case 'INVALIDATE_ANSWER_CACHE':
        await getRAGCacheProvider().invalidateDocument('admin-triggered-cache-refresh');
        return 'Answer cache invalidated.';
      case 'REFRESH_CONFIG_CACHE':
        await configCacheService.invalidateAll();
        return 'Configuration cache refreshed across all instances.';
      default:
        throw new Error(`${actionType} is not a synchronous action.`);
    }
  }

  private async executeBackgroundAction(
    actionType: RagIncidentActionType,
    alertId: string,
    actorId: string,
    requestId: string,
    trigger: 'MANUAL' | 'AUTOMATIC_FOLLOW_UP'
  ): Promise<RagIncidentActionResult> {
    await this.logAction(actorId, alertId, { requestId, actionType, status: 'REQUESTED', resultSummary: 'Queued for background execution.', trigger });
    try {
      await rabbitmq.publishToQueue<RagIncidentActionJobPayload>(QUEUES.RAG_INCIDENT_ACTION, {
        jobType: 'RAG_INCIDENT_ACTION',
        version: 1,
        jobId: randomUUID(),
        actionType: 'RERUN_HEALTH_EVALUATION',
        requestId,
        alertId,
        initiatedBy: actorId,
        trigger,
        attempt: 1,
        createdAt: new Date().toISOString()
      });
      return { requestId, actionType, status: 'REQUESTED', resultSummary: 'Queued for background execution.' };
    } catch (err) {
      console.error(`[RagIncidentActionService] Failed to enqueue ${actionType} for alert ${alertId}:`, err instanceof Error ? err.message : err);
      const resultSummary = 'Failed to queue action for background execution.';
      await this.logAction(actorId, alertId, { requestId, actionType, status: 'FAILED', resultSummary, trigger });
      return { requestId, actionType, status: 'FAILED', resultSummary };
    }
  }

  /** Fire-and-forget — a follow-up re-evaluation never blocks, and its own failure is swallowed
   * (already logged by the caller's own try/catch upstream would be redundant here). */
  private async enqueueFollowUpHealthCheck(alertId: string, actorId: string): Promise<void> {
    await this.executeBackgroundAction('RERUN_HEALTH_EVALUATION', alertId, actorId, randomUUID(), 'AUTOMATIC_FOLLOW_UP');
  }

  private async logAction(
    actorId: string,
    alertId: string,
    details: { requestId: string; actionType: string; status: string; resultSummary: string; trigger?: string }
  ): Promise<void> {
    await auditService.logEvent({
      actorId,
      action: AUDIT_ACTION_NAME,
      targetType: AUDIT_TARGET_TYPE,
      targetId: alertId,
      details
    });
  }

  /** Recent action history for one incident's detail view — derived entirely from the existing
   * audit log, never a duplicate record. */
  public async listRecentActions(alertId: string, limit = 10): Promise<Array<Record<string, unknown>>> {
    const { items } = await auditService.getAuditLogs({ action: AUDIT_ACTION_NAME, targetId: alertId, pageSize: limit });
    return items.map((item) => ({
      ...(typeof item.details === 'object' && item.details !== null ? item.details : {}),
      initiatedBy: item.actorId,
      createdAt: item.createdAt
    }));
  }
}

export const ragIncidentActionService = new RagIncidentActionService();
