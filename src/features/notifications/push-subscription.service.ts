import { prisma } from '@/lib/prisma';
import { configService } from '@/features/config';
import { ValidationError } from '@/errors';

export interface PushSubscriptionInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  userAgent?: string;
}

export class PushSubscriptionService {
  /**
   * Idempotent: re-subscribing the same browser (same endpoint) just refreshes its keys —
   * browsers occasionally rotate keys for an existing endpoint without the user re-granting
   * permission, so this must never create a duplicate row for the same endpoint.
   */
  public async subscribe(userId: string, input: PushSubscriptionInput): Promise<void> {
    if (!input.endpoint || !input.keys?.p256dh || !input.keys?.auth) {
      throw new ValidationError('A valid push subscription (endpoint + keys.p256dh + keys.auth) is required.');
    }

    const existing = await prisma.pushSubscription.findUnique({ where: { endpoint: input.endpoint } });
    if (existing) {
      await prisma.pushSubscription.update({
        where: { endpoint: input.endpoint },
        data: { userId, p256dh: input.keys.p256dh, auth: input.keys.auth, userAgent: input.userAgent, lastUsedAt: new Date() }
      });
      return;
    }

    const maxPerUser = await configService.getNumber('PUSH_NOTIFICATION_MAX_SUBSCRIPTIONS_PER_USER', 10);
    const currentCount = await prisma.pushSubscription.count({ where: { userId } });
    if (currentCount >= maxPerUser) {
      // Evict the oldest subscription rather than reject — a user hitting the cap almost always
      // means old browser/device subscriptions accumulated, not a real 10-device fan-out.
      const oldest = await prisma.pushSubscription.findFirst({ where: { userId }, orderBy: { createdAt: 'asc' } });
      if (oldest) await prisma.pushSubscription.delete({ where: { id: oldest.id } }).catch(() => {});
    }

    await prisma.pushSubscription.create({
      data: {
        userId,
        endpoint: input.endpoint,
        p256dh: input.keys.p256dh,
        auth: input.keys.auth,
        userAgent: input.userAgent
      }
    });
  }

  public async unsubscribe(userId: string, endpoint: string): Promise<void> {
    await prisma.pushSubscription.deleteMany({ where: { userId, endpoint } });
  }

  public async isSubscribed(userId: string, endpoint: string): Promise<boolean> {
    const existing = await prisma.pushSubscription.findFirst({ where: { userId, endpoint } });
    return Boolean(existing);
  }

  public async hasAnySubscription(userId: string): Promise<boolean> {
    const count = await prisma.pushSubscription.count({ where: { userId } });
    return count > 0;
  }
}

export const pushSubscriptionService = new PushSubscriptionService();
