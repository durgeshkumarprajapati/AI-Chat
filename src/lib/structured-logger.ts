import { SECRET_KEY_PATTERNS } from '@/features/config/config.constants';

/**
 * Phase 91 — small, dependency-free structured logger.
 *
 * This is NEW, additive infrastructure for genuinely new logging call sites this phase adds
 * (e.g. the worker scheduler-lock guard, the new health routes) — it does NOT replace any
 * existing `console.log` call site across the codebase; that would be a large, out-of-scope
 * refactor. Existing telemetry/log conventions are left exactly as they are.
 *
 * Emits one JSON line per call via `console.log`/`console.warn`/`console.error` (so it still
 * flows through whatever log-collection the deployment already has wired up for stdout/stderr —
 * no new npm dependency, no new transport). Every line carries:
 *  - timestamp (ISO 8601)
 *  - level ('info' | 'warn' | 'error')
 *  - service (e.g. 'web' | 'worker' — passed to `createLogger`, or via SERVICE_NAME env var for
 *    the default `log` export)
 *  - environment (NODE_ENV)
 *  - message
 *  - correlationId (if present in `meta`)
 *  - meta (any additional metadata, after redaction — see below)
 *
 * Redaction: reuses the exact same `SECRET_KEY_PATTERNS` array already used by
 * `config-validator.ts` / `copilot-memory.service.ts` (never a second, drifting pattern list) to
 * recursively redact any object key that looks secret-like before the entry is serialized —
 * mirrors `AuditService.sanitizeMetadata`'s recursive-redaction approach.
 */
export type LogLevel = 'info' | 'warn' | 'error';

export interface LogMeta {
  correlationId?: string;
  [key: string]: unknown;
}

const REDACTED = '[REDACTED]';

function redactValue(value: unknown, seen: WeakSet<object>): unknown {
  if (!value || typeof value !== 'object') return value;

  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }

  if (seen.has(value as object)) return '[CIRCULAR]';
  seen.add(value as object);

  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item, seen));
  }

  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    if (SECRET_KEY_PATTERNS.some((pattern) => pattern.test(key))) {
      out[key] = REDACTED;
    } else {
      out[key] = redactValue(val, seen);
    }
  }
  return out;
}

export class StructuredLogger {
  constructor(private readonly service: string) {}

  private emit(level: LogLevel, message: string, meta?: LogMeta): void {
    const { correlationId, ...rest } = meta ?? {};

    const entry: Record<string, unknown> = {
      timestamp: new Date().toISOString(),
      level,
      service: this.service,
      environment: process.env.NODE_ENV || 'development',
      message
    };

    if (correlationId) {
      entry.correlationId = correlationId;
    }

    if (Object.keys(rest).length > 0) {
      const sanitized = redactValue(rest, new WeakSet());
      entry.meta = sanitized;
    }

    const line = JSON.stringify(entry);
    if (level === 'error') {
      console.error(line);
    } else if (level === 'warn') {
      console.warn(line);
    } else {
      console.log(line);
    }
  }

  public info(message: string, meta?: LogMeta): void {
    this.emit('info', message, meta);
  }

  public warn(message: string, meta?: LogMeta): void {
    this.emit('warn', message, meta);
  }

  public error(message: string, meta?: LogMeta): void {
    this.emit('error', message, meta);
  }
}

export function createLogger(service: string): StructuredLogger {
  return new StructuredLogger(service);
}

/** Default logger instance; service name comes from SERVICE_NAME, falling back to 'web'. */
export const log = createLogger(process.env.SERVICE_NAME || 'web');
