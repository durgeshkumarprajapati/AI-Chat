import { configService } from '@/features/config/config.service';
import { AssistantIntent } from '../types/assistant.types';

/**
 * Phase 89 — Assistant telemetry.
 *
 * Mirrors perf-telemetry.service.ts's exact pattern: a bounded in-memory ring buffer, a
 * console.log-JSON sink, gated by a boolean config check, and NEVER throws — a telemetry failure
 * must never affect the chat turn it is measuring.
 *
 * Event names are kept verbatim as `copilot.*` per the spec's own literal telemetry/observability
 * contract, even though the code-level feature is named "Assistant" — only the Prisma/route/
 * directory naming needed to change for the naming-collision avoidance documented in the
 * migration header; event names are a separate, spec-mandated contract.
 *
 * Never logs raw message content beyond a short, truncated snippet (256 chars) — useful for
 * debugging classification/routing issues without persisting/emitting a user's full message text
 * through the logging pipeline.
 */
export type AssistantTelemetryEventName =
  | 'copilot.request'
  | 'copilot.response'
  | 'copilot.streaming.started'
  | 'copilot.streaming.completed'
  | 'copilot.tool.requested'
  | 'copilot.tool.completed'
  | 'copilot.tool.failed'
  | 'copilot.approval.required'
  | 'copilot.error'
  | 'copilot.rate_limited';

export interface AssistantTelemetryEvent {
  event: AssistantTelemetryEventName;
  requestId?: string;
  userId?: string;
  intent?: AssistantIntent;
  channel?: string;
  latencyMs?: number;
  cacheHit?: boolean;
  errorCategory?: string;
  messageSnippet?: string;
  [key: string]: unknown;
}

export interface AssistantTelemetryRecord extends AssistantTelemetryEvent {
  timestamp: string;
}

const MAX_SNIPPET_LENGTH = 256;

export class AssistantTelemetryService {
  private buffer: AssistantTelemetryRecord[] = [];
  private readonly maxBufferSize = 1000;

  /** Truncates arbitrary user-supplied text to a short debugging snippet. Never the full message. */
  public truncateSnippet(text: string | undefined | null): string | undefined {
    if (!text) return undefined;
    return text.length > MAX_SNIPPET_LENGTH ? `${text.slice(0, MAX_SNIPPET_LENGTH)}…` : text;
  }

  public async logEvent(payload: AssistantTelemetryEvent): Promise<void> {
    try {
      const enabled = await configService.getBoolean('PERF_TELEMETRY_ENABLED', true);
      const record: AssistantTelemetryRecord = { timestamp: new Date().toISOString(), ...payload };
      this.buffer.push(record);
      if (this.buffer.length > this.maxBufferSize) {
        this.buffer.shift();
      }
      if (!enabled) return;
      console.log(`[AssistantTelemetry] ${JSON.stringify(record)}`);
    } catch {
      // never let telemetry failures affect the request
    }
  }

  /** Read-only snapshot of the current ring buffer. */
  public getBuffer(): AssistantTelemetryRecord[] {
    return [...this.buffer];
  }
}

export const assistantTelemetryService = new AssistantTelemetryService();
