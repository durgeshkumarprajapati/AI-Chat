import { MemoryCandidateExtractionJobPayload } from '@/lib/rabbitmq';
import { prisma } from '@/lib/prisma';
import { configService } from '@/features/config';
import { SECRET_KEY_PATTERNS } from '@/features/config/config.constants';
import { copilotMemoryService } from '@/features/copilot/memory/copilot-memory.service';
import { llmGateway } from '@/features/llm/llm-gateway.service';
import { CopilotMemoryCategory } from '@/features/copilot/types/copilot.types';

export type ProcessingResultAction = 'PERMANENT_ERROR' | 'TRANSIENT_ERROR';

export interface ProcessingResult {
  status: 'SUCCESS' | 'STALE_DISCARD' | 'FAILED';
  action?: ProcessingResultAction;
  errorMessage?: string;
}

interface DetectionResult {
  content: string;
  category: CopilotMemoryCategory;
  confidence: number;
  needsClassification: boolean;
}

const MIN_CONTENT_LENGTH = 12;

// Cheap, bounded, regex/keyword-based — deliberately mirrors CopilotRouterService.classifyIntent's
// simple `.includes()`/regex style rather than anything more elaborate. Never runs an LLM per
// message unconditionally.
const STOPLIST = ['hi', 'hello', 'hey', 'thanks', 'thank you', 'ok', 'okay', 'yes', 'no', 'sure', 'bye', 'goodbye', 'yep', 'nope'];

const PREFERENCE_PATTERNS = [
  /\bi prefer\b/i,
  /\bi like\b/i,
  /\bi always\b/i,
  /\bi usually\b/i,
  /\bremember that\b/i,
  /\bplease remember\b/i,
  /\bfrom now on\b/i,
  /\bmy preference (is|for)\b/i
];

const DECISION_PATTERNS = [
  /\bwe decided\b/i,
  /\bwe're using\b/i,
  /\bwe are using\b/i,
  /\blet'?s use\b/i,
  /\bwe chose\b/i,
  /\bwe will use\b/i,
  /\bdecided to use\b/i,
  /\bgoing with\b/i
];

const FACT_PATTERNS = [
  /\bmy name is\b/i,
  /\bi work at\b/i,
  /\bi am a\b/i,
  /\bi'm a\b/i,
  /\bmy role is\b/i,
  /\bmy team\b/i,
  /\bmy timezone\b/i,
  /\bmy email is\b/i
];

// A "plausible candidate but ambiguous category" signal — this is the ONLY path that triggers the
// single, bounded, optional LLM classification call (step (c) of the spec's pipeline).
const AMBIGUOUS_PATTERNS = [/\bnote that\b/i, /\bkeep in mind\b/i, /\bfor future reference\b/i, /\bimportant:\s*/i, /\bdon'?t forget\b/i];

const VALID_CATEGORIES: CopilotMemoryCategory[] = [
  'USER_PREFERENCE',
  'LEARNING_PREFERENCE',
  'PROJECT_CONTEXT',
  'GOAL',
  'TECHNICAL_CONTEXT',
  'WORKFLOW_PREFERENCE',
  'USER_PROFILE',
  'TECHNICAL_DECISION',
  'IMPORTANT_FACT',
  'CONVERSATION_MEMORY',
  'WORKING_PATTERN'
];

/**
 * Phase 90 worker processor for the memory-candidate-extraction queue.
 *
 * Step order (matches the spec exactly):
 *  (a) reload MemorySettings fresh from Postgres — settings may have changed since the job was
 *      queued, so the queue-time snapshot is never trusted.
 *  (b) deterministic candidate detection first (cheap, no LLM) — keyword/pattern heuristics.
 *  (c) only if the deterministic pass found a plausible-but-ambiguous candidate, ONE bounded
 *      `llmGateway.generateStructured` call to categorize it — never unconditional, never more
 *      than once per job, and its failure is non-fatal (falls back to the deterministic guess).
 *  (d) secret-pattern rejection (reuses SECRET_KEY_PATTERNS — also re-checked inside
 *      recordMemoryCandidate, defense in depth).
 *  (e) `copilotMemoryService.recordMemoryCandidate` — idempotent via the existing key-based
 *      upsert, safe on redelivery.
 *  (f) telemetry only — never logs raw message content.
 */
export class MemoryExtractionProcessor {
  public async process(job: MemoryCandidateExtractionJobPayload): Promise<ProcessingResult> {
    if (job.jobType !== 'MEMORY_CANDIDATE_EXTRACTION' || !job.userId || !job.userMessage) {
      console.warn('[Worker-MemoryExtraction] Invalid job payload structure.');
      return { status: 'STALE_DISCARD' };
    }

    try {
      const candidateProcessingEnabled = await configService.getBoolean('AI_MEMORY_CANDIDATE_PROCESSING_ENABLED', true);
      if (!candidateProcessingEnabled) {
        return { status: 'SUCCESS' };
      }

      // (a) Never trust the queue-time snapshot — reload fresh.
      const settings = await prisma.memorySettings.findUnique({ where: { userId: job.userId } });
      const memoryEnabled = settings
        ? settings.memoryEnabled
        : await configService.getBoolean('AI_MEMORY_ENABLED', true);
      const autoLearnEnabled = settings
        ? settings.autoLearnEnabled
        : await configService.getBoolean('AI_MEMORY_AUTO_LEARN_ENABLED', true);

      if (!memoryEnabled || !autoLearnEnabled) {
        console.log(`[Worker-MemoryExtraction] Memory/auto-learn disabled for user; no-op (job ${job.jobId}).`);
        return { status: 'SUCCESS' };
      }

      // (b) deterministic detection.
      const detection = this.detectCandidate(job.userMessage);
      if (!detection) {
        return { status: 'SUCCESS' };
      }

      // (d) secret rejection, early exit (recordMemoryCandidate re-checks this too).
      if (SECRET_KEY_PATTERNS.some((pattern) => pattern.test(detection.content))) {
        console.log(`[Worker-MemoryExtraction] Candidate rejected (secret-pattern match) for job ${job.jobId}.`);
        return { status: 'SUCCESS' };
      }

      console.log(`[Worker-MemoryExtraction] memory.candidate.detected (job=${job.jobId}, category=${detection.category})`);

      let category = detection.category;
      let confidence = detection.confidence;

      // (c) ONE bounded, optional LLM call — only for the ambiguous-category path.
      if (detection.needsClassification) {
        try {
          const raw = await llmGateway.generateStructured<{ category?: string; confidence?: number }>({
            prompt: `Classify the following user statement into exactly one category: USER_PREFERENCE, TECHNICAL_DECISION, IMPORTANT_FACT, WORKING_PATTERN, or PROJECT_CONTEXT.\n\nStatement: "${detection.content}"`,
            systemPrompt: 'You are a precise text classifier for a personal-memory system. Respond only with the requested structured fields.',
            feature: 'COPILOT',
            userId: job.userId,
            temperature: 0.1,
            timeoutMs: 4000,
            schemaDescription: 'JSON object: { "category": string, "confidence": number (0-1) }',
            exampleJson: JSON.stringify({ category: 'IMPORTANT_FACT', confidence: 0.7 })
          });

          const coerced = this.coerceCategory(raw?.category);
          if (coerced) category = coerced;
          if (typeof raw?.confidence === 'number' && Number.isFinite(raw.confidence)) {
            confidence = Math.max(0, Math.min(1, raw.confidence));
          }
        } catch (err) {
          console.warn(
            `[Worker-MemoryExtraction] Classification call failed for job ${job.jobId}, using deterministic fallback: ${
              err instanceof Error ? err.message : String(err)
            }`
          );
        }
      }

      // (e) idempotent record — safe on redelivery via the existing key-based upsert.
      const result = await copilotMemoryService.recordMemoryCandidate({
        userId: job.userId,
        projectId: job.projectId ?? null,
        category,
        content: detection.content,
        confidence,
        sourceType: 'assistant_conversation',
        sourceId: job.conversationId ?? null
      });

      // (f) telemetry only — never logs message content.
      if (result.created) {
        console.log(`[Worker-MemoryExtraction] memory.created (job=${job.jobId}, category=${category})`);
      }

      return { status: 'SUCCESS' };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[Worker-MemoryExtraction] Job failed (job ${job.jobId}): ${errorMessage}`);

      if (!this.isTransientError(error)) {
        return { status: 'FAILED', action: 'PERMANENT_ERROR', errorMessage };
      }
      return { status: 'FAILED', action: 'TRANSIENT_ERROR', errorMessage };
    }
  }

  private detectCandidate(userMessage: string): DetectionResult | null {
    const trimmed = (userMessage || '').trim();
    if (trimmed.length < MIN_CONTENT_LENGTH) return null;

    const lower = trimmed.toLowerCase();
    if (STOPLIST.some((s) => lower === s || lower.startsWith(`${s} `) || lower.startsWith(`${s},`) || lower.startsWith(`${s}!`))) {
      return null;
    }

    if (PREFERENCE_PATTERNS.some((p) => p.test(trimmed))) {
      return { content: trimmed, category: 'USER_PREFERENCE', confidence: 0.75, needsClassification: false };
    }
    if (DECISION_PATTERNS.some((p) => p.test(trimmed))) {
      return { content: trimmed, category: 'TECHNICAL_DECISION', confidence: 0.75, needsClassification: false };
    }
    if (FACT_PATTERNS.some((p) => p.test(trimmed))) {
      return { content: trimmed, category: 'IMPORTANT_FACT', confidence: 0.7, needsClassification: false };
    }
    if (AMBIGUOUS_PATTERNS.some((p) => p.test(trimmed))) {
      // A plausible candidate, but the deterministic pass can't confidently pick a category —
      // this is the only case that triggers the optional LLM classification call.
      return { content: trimmed, category: 'IMPORTANT_FACT', confidence: 0.5, needsClassification: true };
    }

    return null;
  }

  private coerceCategory(raw: string | undefined): CopilotMemoryCategory | undefined {
    if (!raw) return undefined;
    const upper = raw.trim().toUpperCase();
    return (VALID_CATEGORIES as string[]).includes(upper) ? (upper as CopilotMemoryCategory) : undefined;
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

export const memoryExtractionProcessor = new MemoryExtractionProcessor();
