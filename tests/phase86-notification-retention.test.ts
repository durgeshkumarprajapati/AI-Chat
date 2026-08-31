// Phase 86 — notification-retention.service.ts: bounded batch deletion, never a single unbounded
// DELETE. Asserts findMany is called with `take` and deleteMany with a bounded `id: { in: [...] }`
// array, never an unbounded `createdAt: { lt }` deleteMany.
jest.mock('@/lib/prisma', () => ({
  prisma: {
    notification: { findMany: jest.fn(), deleteMany: jest.fn() }
  }
}));

import { prisma } from '@/lib/prisma';
import { sweepExpiredNotifications } from '@/features/notifications/notification-retention.service';

describe('Phase 86 — notification-retention.service (sweepExpiredNotifications)', () => {
  // resetAllMocks (not clearAllMocks) — clearAllMocks does NOT drain a queued
  // mockResolvedValueOnce()/mockImplementationOnce() chain, which would otherwise leak leftover
  // queued values from a previous test that never consumed all of them (several tests below queue
  // more once-values than the implementation actually calls before returning).
  beforeEach(() => jest.resetAllMocks());

  it('selects a bounded batch of ids via findMany({ take: batchSize }) before deleting', async () => {
    (prisma.notification.findMany as jest.Mock).mockResolvedValue([]);

    await sweepExpiredNotifications(90, 500);

    expect(prisma.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { createdAt: { lt: expect.any(Date) } },
        select: { id: true },
        take: 500
      })
    );
  });

  it('deletes using a bounded id:{in:[...]} clause, NEVER an unbounded createdAt:{lt} deleteMany', async () => {
    (prisma.notification.findMany as jest.Mock)
      .mockResolvedValueOnce([{ id: 'n1' }, { id: 'n2' }])
      .mockResolvedValueOnce([]); // second batch empty -> loop stops
    (prisma.notification.deleteMany as jest.Mock).mockResolvedValue({ count: 2 });

    const result = await sweepExpiredNotifications(90, 500);

    expect(prisma.notification.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['n1', 'n2'] } } });
    // Never called with an unbounded createdAt-based where clause.
    expect(prisma.notification.deleteMany).not.toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ createdAt: expect.anything() }) })
    );
    expect(result.deleted).toBe(2);
  });

  it('stops as soon as a batch returns fewer rows than batchSize (nothing more to sweep)', async () => {
    (prisma.notification.findMany as jest.Mock).mockResolvedValueOnce([{ id: 'n1' }]); // 1 < batchSize(10)
    (prisma.notification.deleteMany as jest.Mock).mockResolvedValue({ count: 1 });

    await sweepExpiredNotifications(90, 10);

    expect(prisma.notification.findMany).toHaveBeenCalledTimes(1);
  });

  it('loops across multiple full batches, accumulating the deleted count, until a partial/empty batch', async () => {
    (prisma.notification.findMany as jest.Mock)
      .mockResolvedValueOnce([{ id: 'a' }, { id: 'b' }]) // full batch of 2
      .mockResolvedValueOnce([{ id: 'c' }]); // partial batch -> stop after this
    (prisma.notification.deleteMany as jest.Mock).mockResolvedValueOnce({ count: 2 }).mockResolvedValueOnce({ count: 1 });

    const result = await sweepExpiredNotifications(90, 2);

    expect(prisma.notification.findMany).toHaveBeenCalledTimes(2);
    expect(result.deleted).toBe(3);
  });

  it('never runs more than a bounded number of batches per invocation (safety cap), even with an endless backlog', async () => {
    (prisma.notification.findMany as jest.Mock).mockResolvedValue([{ id: 'x' }, { id: 'y' }]); // always a "full" batch
    (prisma.notification.deleteMany as jest.Mock).mockResolvedValue({ count: 2 });

    await sweepExpiredNotifications(90, 2);

    // Safety cap of 20 batches per invocation, documented in notification-retention.service.ts.
    expect((prisma.notification.findMany as jest.Mock).mock.calls.length).toBeLessThanOrEqual(20);
  });

  it('returns { deleted: 0 } when there is nothing to sweep', async () => {
    (prisma.notification.findMany as jest.Mock).mockResolvedValue([]);

    const result = await sweepExpiredNotifications(90, 500);

    expect(result).toEqual({ deleted: 0 });
    expect(prisma.notification.deleteMany).not.toHaveBeenCalled();
  });
});
