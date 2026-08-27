import { prisma } from '@/lib/prisma';
import { UsageMetric, UsagePeriod } from '@prisma/client';

export class UsageRepository {
  public async getCount(userId: string, metric: UsageMetric, period: UsagePeriod, periodKey: string): Promise<number> {
    const row = await prisma.usageCounter.findUnique({
      where: { userId_metric_period_periodKey: { userId, metric, period, periodKey } }
    });
    return row?.count ?? 0;
  }

  /** Atomic upsert-increment — safe under concurrent requests (single round-trip, DB-level increment). */
  public async increment(
    userId: string,
    metric: UsageMetric,
    period: UsagePeriod,
    periodKey: string,
    subscriptionId: string | null,
    amount = 1
  ): Promise<number> {
    const row = await prisma.usageCounter.upsert({
      where: { userId_metric_period_periodKey: { userId, metric, period, periodKey } },
      create: { userId, metric, period, periodKey, subscriptionId, count: amount },
      update: { count: { increment: amount } }
    });
    return row.count;
  }

  public async listForUser(userId: string) {
    return prisma.usageCounter.findMany({ where: { userId } });
  }
}

export const usageRepository = new UsageRepository();
