import { configService } from '@/features/config/config.service';

/**
 * Phase 90 — AI Memory telemetry.
 *
 * Mirrors `assistant-telemetry.service.ts` / `perf-telemetry.service.ts`'s exact pattern: a
 * bounded in-memory ring buffer, a console.log-JSON sink gated by a boolean config check, and
 * NEVER throws — a telemetry failure must never affect the memory operation it is measuring.
 *
 * Never logs actual memory content — only category/id/latency/cache-hit metadata.
 */
export type MemoryTelemetryEventName =
  | 'memory.retrieval.started'
  | 'memory.retrieval.completed'
  | 'memory.cache.hit'
  | 'memory.cache.miss'
  | 'memory.candidate.detected'
  | 'memory.created'
  | 'memory.updated'
  | 'memory.deleted'
  | 'memory.exported'
  | 'memory.retrieval.timeout';

export interface MemoryTelemetryEvent {
  event: MemoryTelemetryEventName;
  requestId?: string;
  userId?: string;
  category?: string;
  latencyMs?: number;
  cacheHit?: boolean;
  resultCount?: number;
  [key: string]: unknown;
}

export interface MemoryTelemetryRecord extends MemoryTelemetryEvent {
  timestamp: string;
}

export class MemoryTelemetryService {
  private buffer: MemoryTelemetryRecord[] = [];
  private readonly maxBufferSize = 1000;

  public async logEvent(payload: MemoryTelemetryEvent): Promise<void> {
    try {
      const enabled = await configService.getBoolean('PERF_TELEMETRY_ENABLED', true);
      const record: MemoryTelemetryRecord = { timestamp: new Date().toISOString(), ...payload };
      this.buffer.push(record);
      if (this.buffer.length > this.maxBufferSize) {
        this.buffer.shift();
      }
      if (!enabled) return;
      console.log(`[MemoryTelemetry] ${JSON.stringify(record)}`);
    } catch {
      // never let telemetry failures affect the caller
    }
  }

  /** Read-only snapshot of the current ring buffer. */
  public getBuffer(): MemoryTelemetryRecord[] {
    return [...this.buffer];
  }
}

export const memoryTelemetryService = new MemoryTelemetryService();
