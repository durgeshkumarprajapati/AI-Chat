import { AutomationExecutionJobPayload } from '@/lib/rabbitmq';
import { automationEngineService } from '@/features/automation/engine/automation-engine.service';

export type ProcessingResultAction = 'PERMANENT_ERROR' | 'TRANSIENT_ERROR';

export interface ProcessingResult {
  status: 'SUCCESS' | 'STALE_DISCARD' | 'FAILED';
  action?: ProcessingResultAction;
  errorMessage?: string;
}

/**
 * Phase 88 worker processor for the automation-execution queue.
 *
 * `executionId` is the ONLY thing trusted from the payload — automationEngineService.runExecution
 * reloads the AutomationExecution + its AutomationVersion.definition + owning Automation fresh
 * from Postgres on every invocation, so a duplicate/retried delivery of this exact job is always
 * safe (the engine's own per-node idempotency, not this processor, is what prevents double work).
 */
export class AutomationExecutionProcessor {
  public async process(job: AutomationExecutionJobPayload): Promise<ProcessingResult> {
    if (job.jobType !== 'AUTOMATION_EXECUTION' || !job.executionId) {
      console.warn(`[Worker-AutomationExecution] Invalid job payload structure: ${JSON.stringify(job)}`);
      return { status: 'STALE_DISCARD' };
    }

    try {
      await automationEngineService.runExecution(job.executionId);
      console.log(`[Worker-AutomationExecution] Execution ${job.executionId} processed.`);
      return { status: 'SUCCESS' };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[Worker-AutomationExecution] Job failed for execution ${job.executionId}: ${errorMessage}`);

      const lowerMessage = errorMessage.toLowerCase();
      if (
        lowerMessage.includes('not found') ||
        lowerMessage.includes('unregistered') ||
        lowerMessage.includes('security') ||
        lowerMessage.includes('forbidden')
      ) {
        return { status: 'FAILED', action: 'PERMANENT_ERROR', errorMessage };
      }

      if (!this.isTransientError(error)) {
        return { status: 'FAILED', action: 'PERMANENT_ERROR', errorMessage };
      }

      return { status: 'FAILED', action: 'TRANSIENT_ERROR', errorMessage };
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

export const automationExecutionProcessor = new AutomationExecutionProcessor();
