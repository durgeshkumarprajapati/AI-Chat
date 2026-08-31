import { AIIntelligenceJobPayload } from '@/lib/rabbitmq';
import { aiIntelligenceService } from '@/features/ai-intelligence/services/ai-intelligence.service';

export type ProcessingResultAction = 'PERMANENT_ERROR' | 'TRANSIENT_ERROR';

export interface ProcessingResult {
  status: 'SUCCESS' | 'STALE_DISCARD' | 'FAILED';
  action?: ProcessingResultAction;
  errorMessage?: string;
}

/**
 * Phase 85 worker processor for the ai-intelligence-daily/weekly queues. Calls the SAME
 * aiIntelligenceService.generateSnapshot(...) facade the on-demand API POST routes call — there
 * is no separate worker-only generation code path. If generateSnapshot's own idempotency check
 * finds an already-READY snapshot for this exact period (e.g. the message was redelivered after
 * an ack was lost), that is treated as SUCCESS, not an error — an idempotent-retry is the
 * expected, correct outcome, never a failure.
 */
export class AiIntelligenceProcessor {
  public async process(job: AIIntelligenceJobPayload): Promise<ProcessingResult> {
    if (
      (job.jobType !== 'AI_INTELLIGENCE_DAILY' && job.jobType !== 'AI_INTELLIGENCE_WEEKLY') ||
      !job.userId
    ) {
      console.warn(`[Worker-AIIntelligence] Invalid job payload structure: ${JSON.stringify(job)}`);
      return { status: 'STALE_DISCARD' };
    }

    const type = job.jobType === 'AI_INTELLIGENCE_DAILY' ? 'DAILY' : 'WEEKLY';

    try {
      const snapshot = await aiIntelligenceService.generateSnapshot(job.userId, type, job.projectId ?? null);

      if (snapshot.status === 'FAILED') {
        // generateSnapshot itself does not throw for generation-internal failures (aggregation/
        // LLM errors) — it persists a FAILED snapshot row and returns it. Treat that as a
        // (potentially transient) processing failure here so the queue's retry policy applies.
        const isTransient = this.isTransientError(new Error('AI Workspace Intelligence snapshot generation failed'));
        return { status: 'FAILED', action: isTransient ? 'TRANSIENT_ERROR' : 'PERMANENT_ERROR', errorMessage: 'Snapshot generation failed' };
      }

      console.log(`[Worker-AIIntelligence] Generated ${type} snapshot ${snapshot.id} for user ${job.userId} (status=${snapshot.status})`);
      return { status: 'SUCCESS' };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[Worker-AIIntelligence] Job failed for user ${job.userId}: ${errorMessage}`);

      // A user (or project) that no longer exists / was deleted mid-flight is a permanent,
      // non-retryable condition — discard rather than endlessly retry a job that can never
      // succeed. Prisma foreign-key/record-not-found errors surface distinctive substrings.
      const lowerMessage = errorMessage.toLowerCase();
      if (lowerMessage.includes('record to update not found') || lowerMessage.includes('foreign key constraint') || lowerMessage.includes('record to delete does not exist')) {
        return { status: 'FAILED', action: 'PERMANENT_ERROR', errorMessage };
      }

      if (!this.isTransientError(error)) {
        return { status: 'FAILED', action: 'PERMANENT_ERROR', errorMessage };
      }

      return { status: 'FAILED', action: 'TRANSIENT_ERROR', errorMessage };
    }
  }

  // Same string-matching convention as worker/src/processors/knowledge-graph.processor.ts.
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

export const aiIntelligenceProcessor = new AiIntelligenceProcessor();
