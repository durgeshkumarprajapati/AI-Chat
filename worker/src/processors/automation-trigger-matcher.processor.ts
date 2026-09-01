import { randomUUID } from 'crypto';
import { prisma } from '@/lib/prisma';
import { rabbitmq, QUEUES, AutomationDomainEventPayload, AutomationExecutionJobPayload } from '@/lib/rabbitmq';
import { buildAutomationExecutionIdempotencyKey, tryClaimAutomationExecution } from '@/features/automation/idempotency/automation-execution-dedup.service';
import { automationRateLimitService } from '@/features/automation/rate-limit/automation-rate-limit.service';

export type ProcessingResultAction = 'PERMANENT_ERROR' | 'TRANSIENT_ERROR';

export interface ProcessingResult {
  status: 'SUCCESS' | 'STALE_DISCARD' | 'FAILED';
  action?: ProcessingResultAction;
  errorMessage?: string;
}

/** A tiny, bounded, safe shallow key/value equality matcher — NEVER a general expression engine.
 * `filterJson: null` (no filter configured) always matches. */
function matchesFilter(filterJson: unknown, payload: Record<string, unknown>): boolean {
  if (!filterJson || typeof filterJson !== 'object') return true;
  for (const [key, expected] of Object.entries(filterJson as Record<string, unknown>)) {
    if (payload[key] !== expected) return false;
  }
  return true;
}

/**
 * Phase 88 worker processor for the automation-event-dispatch queue.
 *
 * Never trusts the RabbitMQ payload for anything security- or state-relevant beyond "which
 * trigger type fired and for which source entity" — before ever creating an AutomationExecution,
 * it re-queries Postgres for the CURRENT authoritative state (automation.status === 'ACTIVE',
 * binding.enabled, the automation's live currentVersionId). A stale/duplicate event that no
 * longer matches anything (automation since paused, binding since deleted) simply produces zero
 * executions.
 */
export class AutomationTriggerMatcherProcessor {
  public async process(job: AutomationDomainEventPayload): Promise<ProcessingResult> {
    if (job.jobType !== 'AUTOMATION_DOMAIN_EVENT' || !job.eventType || !job.sourceEntityId) {
      console.warn(`[Worker-AutomationTriggerMatcher] Invalid job payload structure: ${JSON.stringify(job)}`);
      return { status: 'STALE_DISCARD' };
    }

    try {
      const bindings = await prisma.automationTriggerBinding.findMany({
        where: {
          triggerType: job.eventType,
          enabled: true,
          automation: { status: 'ACTIVE', isActive: true }
        },
        include: { automation: { include: { currentVersion: true } } }
      });

      let createdCount = 0;
      const payload = (job.payload || {}) as Record<string, unknown>;

      for (const binding of bindings) {
        const automation = binding.automation;
        if (!automation.currentVersion) continue;
        if (!matchesFilter(binding.filterJson, payload)) continue;

        // Rate limits fail OPEN on Redis unavailability (see automationRateLimitService) — never
        // block a legitimate execution just because Redis is down; these are best-effort caps.
        const [automationOk, userOk] = await Promise.all([
          automationRateLimitService.checkAutomationHourlyLimit(automation.id),
          automationRateLimitService.checkUserHourlyLimit(automation.userId)
        ]);
        if (!automationOk || !userOk) {
          console.warn(
            `[Worker-AutomationTriggerMatcher] Rate limit exceeded for automation ${automation.id}; skipping this trigger event.`
          );
          continue;
        }

        const idempotencyKey = buildAutomationExecutionIdempotencyKey(automation.id, job.eventType, job.sourceEntityId);
        const claim = await tryClaimAutomationExecution(() =>
          prisma.automationExecution.create({
            data: {
              automationId: automation.id,
              automationVersionId: automation.currentVersion!.id,
              triggerType: job.eventType,
              triggerPayload: payload as any,
              idempotencyKey,
              status: 'QUEUED'
            }
          })
        );

        if (!claim.claimed || !claim.executionId) {
          continue; // already executed for this exact trigger event — safe no-op
        }

        createdCount += 1;
        await prisma.automationTriggerBinding.update({
          where: { id: binding.id },
          data: { lastMatchedAt: new Date() }
        });

        await rabbitmq.publishToQueue<AutomationExecutionJobPayload>(QUEUES.AUTOMATION_EXECUTION, {
          jobType: 'AUTOMATION_EXECUTION',
          version: 1,
          jobId: randomUUID(),
          executionId: claim.executionId,
          attempt: 1,
          createdAt: new Date().toISOString()
        });
      }

      console.log(
        `[Worker-AutomationTriggerMatcher] Event ${job.eventType}/${job.sourceEntityId}: ${bindings.length} candidate binding(s), ${createdCount} execution(s) created.`
      );
      return { status: 'SUCCESS' };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[Worker-AutomationTriggerMatcher] Job failed: ${errorMessage}`);
      return { status: 'FAILED', action: this.isTransientError(error) ? 'TRANSIENT_ERROR' : 'PERMANENT_ERROR', errorMessage };
    }
  }

  private isTransientError(error: unknown): boolean {
    if (!error) return false;
    const msg = error instanceof Error ? error.message : String(error);
    return (
      msg.includes('ECONNREFUSED') ||
      msg.includes('ETIMEDOUT') ||
      msg.includes('ECONNRESET') ||
      msg.includes('500') ||
      msg.includes('502') ||
      msg.includes('503') ||
      msg.includes('504') ||
      msg.includes('fetch failed')
    );
  }
}

export const automationTriggerMatcherProcessor = new AutomationTriggerMatcherProcessor();
