import { AIAgentExecutionJobPayload } from '@/lib/rabbitmq';
import { executionEngineService } from '@/features/ai-agent/execution-engine.service';

export type ProcessingResultAction = 'PERMANENT_ERROR' | 'TRANSIENT_ERROR';

export interface ProcessingResult {
  status: 'SUCCESS' | 'STALE_DISCARD' | 'FAILED';
  action?: ProcessingResultAction;
  errorMessage?: string;
}

/**
 * Phase 87 worker processor for the ai-agent-execution queue.
 *
 * Executes agent runs asynchronously. Uses executionEngineService.executeRun, which enforces:
 *  1. Scoped ownership & project authorization.
 *  2. Step approval requirement check before executing side-effecting actions.
 *  3. Per-step idempotency key tracking to avoid duplicate tool calls.
 *  4. Maximum run execution time budget.
 */
export class AiAgentExecutionProcessor {
  public async process(job: AIAgentExecutionJobPayload): Promise<ProcessingResult> {
    if (job.jobType !== 'AI_AGENT_EXECUTION' || !job.userId || !job.runId) {
      console.warn(`[Worker-AIAgentExecution] Invalid job payload structure: ${JSON.stringify(job)}`);
      return { status: 'STALE_DISCARD' };
    }

    try {
      const run = await executionEngineService.executeRun(job.userId, job.runId);

      console.log(`[Worker-AIAgentExecution] Agent run ${run.id} processed (status=${run.status})`);
      return { status: 'SUCCESS' };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[Worker-AIAgentExecution] Job failed for run ${job.runId}: ${errorMessage}`);

      const lowerMessage = errorMessage.toLowerCase();
      if (
        lowerMessage.includes('not found') ||
        lowerMessage.includes('unregistered tool') ||
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

export const aiAgentExecutionProcessor = new AiAgentExecutionProcessor();
