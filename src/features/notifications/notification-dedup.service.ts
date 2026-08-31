import { NotificationType, Prisma } from '@prisma/client';

/**
 * Builds a stable dedupe key for a Phase 86 notification. `sourceId` is the originating
 * snapshot/insight id; `windowKey` is a stable period string (e.g. the snapshot's periodStart
 * date string) so re-delivery attempts for the SAME period collide, while a new period's
 * notification gets a fresh key.
 */
export function buildDedupeKey(userId: string, type: NotificationType, sourceId: string, windowKey: string): string {
  return `notification:v1:${userId}:${type}:${sourceId}:${windowKey}`;
}

const UNIQUE_CONSTRAINT_VIOLATION = 'P2002';

function isUniqueConstraintViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: unknown }).code === UNIQUE_CONSTRAINT_VIOLATION
  );
}

/**
 * Attempts `createFn()` (which must set `dedupeKey` on the created Notification row) and treats
 * a Prisma unique-constraint violation on `dedupeKey` (P2002) as `{claimed:false}` rather than an
 * error — someone else (or an earlier attempt/retry) already delivered this exact notification.
 *
 * THIS is the authoritative, DB-enforced idempotency gate. Any Redis-based pre-check elsewhere is
 * purely an optimization to avoid unnecessary work before reaching this point — never the sole
 * correctness mechanism, since Redis can be unavailable or evicted.
 */
export async function tryClaimDedupeKey(
  dedupeKey: string,
  createFn: () => Promise<{ id: string } | null>
): Promise<{ claimed: boolean; notificationId?: string }> {
  void dedupeKey; // kept in the signature for API clarity/documentation; the actual key value is
  // set on the row by `createFn`'s own closure — this function only interprets the DB's response.
  try {
    const created = await createFn();
    if (!created) return { claimed: false };
    return { claimed: true, notificationId: created.id };
  } catch (err) {
    if (isUniqueConstraintViolation(err)) {
      return { claimed: false };
    }
    throw err;
  }
}

// Re-exported for callers that want to reference the Prisma error shape without importing
// @prisma/client directly for just this.
export type { Prisma };
