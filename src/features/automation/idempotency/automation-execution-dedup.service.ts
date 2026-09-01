import { AutomationTriggerType } from '@prisma/client';

/**
 * Phase 88 — mirrors notification-dedup.service.ts's exact pattern: the DB-unique constraint on
 * `AutomationExecution.idempotencyKey` is the sole AUTHORITATIVE idempotency gate. A Redis-based
 * pre-check (see automation-rate-limit.service.ts) is purely an optimization to avoid unnecessary
 * work before reaching this point — never the sole correctness mechanism.
 */
export function buildAutomationExecutionIdempotencyKey(
  automationId: string,
  triggerType: AutomationTriggerType,
  sourceEntityId: string
): string {
  return `automation:v1:${automationId}:${triggerType}:${sourceEntityId}`;
}

const UNIQUE_CONSTRAINT_VIOLATION = 'P2002';

export function isUniqueConstraintViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: unknown }).code === UNIQUE_CONSTRAINT_VIOLATION
  );
}

/**
 * Attempts `createFn()` (which must set `idempotencyKey` on the created AutomationExecution row)
 * and treats a Prisma unique-constraint violation (P2002) as `{claimed:false}` rather than an
 * error — the SAME trigger event (or a duplicate/retried RabbitMQ delivery of it) already started
 * exactly one execution.
 */
export async function tryClaimAutomationExecution(
  createFn: () => Promise<{ id: string } | null>
): Promise<{ claimed: boolean; executionId?: string }> {
  try {
    const created = await createFn();
    if (!created) return { claimed: false };
    return { claimed: true, executionId: created.id };
  } catch (err) {
    if (isUniqueConstraintViolation(err)) {
      return { claimed: false };
    }
    throw err;
  }
}
