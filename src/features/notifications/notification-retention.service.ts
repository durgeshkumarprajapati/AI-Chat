import { prisma } from '@/lib/prisma';

// Safety cap on how many batches a single sweep invocation will run, so one scheduler tick can
// never run forever even if there is a huge backlog of expired rows.
const MAX_BATCHES_PER_SWEEP = 20;

/**
 * Bounded batch deletion of Notification rows older than `retentionDays`. Never a single
 * unbounded DELETE: selects a bounded batch of ids first (`findMany` with `take`), then deletes
 * exactly that batch (`deleteMany` with `id: { in: ids } }`), repeating up to MAX_BATCHES_PER_SWEEP
 * times. Never touches AuditLog — a completely separate table/service, out of scope here.
 */
export async function sweepExpiredNotifications(retentionDays: number, batchSize: number): Promise<{ deleted: number }> {
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  let deleted = 0;

  for (let batch = 0; batch < MAX_BATCHES_PER_SWEEP; batch++) {
    const ids = await prisma.notification.findMany({
      where: { createdAt: { lt: cutoff } },
      select: { id: true },
      take: batchSize
    });

    if (ids.length === 0) break;

    const result = await prisma.notification.deleteMany({
      where: { id: { in: ids.map((row) => row.id) } }
    });

    deleted += result.count;

    if (ids.length < batchSize) break; // fewer than a full batch — nothing more to sweep right now
  }

  return { deleted };
}
