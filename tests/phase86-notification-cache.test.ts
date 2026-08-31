// Phase 86 — cache (spec section 30, explicitly optional): a nice-to-have unread-count cache was
// evaluated and DELIBERATELY NOT ADDED. `notificationService.getUnreadCount` is already a single
// indexed `prisma.notification.count({ where: { userId, isRead: false } })` call — the
// `@@index([userId, isRead, createdAt])` index on Notification (pre-existing, untouched by
// Phase 86) makes this a cheap, fast query on its own. Layering Redis on top would add cache-
// invalidation complexity (every notification create/read/delete would need to bust the cache)
// for a query that is not a bottleneck, so this phase intentionally skips it — this test file
// documents and enforces that decision rather than exercising a cache that doesn't exist.
jest.mock('@/lib/prisma', () => ({
  prisma: { notification: { count: jest.fn().mockResolvedValue(3) } }
}));
jest.mock('@/lib/redis', () => ({
  redis: { getJson: jest.fn(), setJson: jest.fn(), get: jest.fn(), set: jest.fn(), getClient: jest.fn() }
}));

import { prisma } from '@/lib/prisma';
import { redis } from '@/lib/redis';
import { notificationService } from '@/features/notifications/notification.service';

describe('Phase 86 — no unread-count cache was added (deliberate scope decision, documented)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('getUnreadCount goes straight to the DB (a single indexed count query) and never touches Redis', async () => {
    const count = await notificationService.getUnreadCount('user-1');

    expect(count).toBe(3);
    expect(prisma.notification.count).toHaveBeenCalledWith({ where: { userId: 'user-1', isRead: false } });
    expect(redis.getJson).not.toHaveBeenCalled();
    expect(redis.setJson).not.toHaveBeenCalled();
    expect(redis.get).not.toHaveBeenCalled();
    expect(redis.set).not.toHaveBeenCalled();
  });

  it('repeated calls always re-read from the DB (no stale-cache risk, since there is no cache)', async () => {
    (prisma.notification.count as jest.Mock).mockResolvedValueOnce(3).mockResolvedValueOnce(4);

    const first = await notificationService.getUnreadCount('user-1');
    const second = await notificationService.getUnreadCount('user-1');

    expect(first).toBe(3);
    expect(second).toBe(4); // reflects the DB change immediately — nothing to invalidate
    expect(prisma.notification.count).toHaveBeenCalledTimes(2);
  });
});
