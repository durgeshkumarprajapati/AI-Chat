import { UsageMetric, UsagePeriod } from '@prisma/client';
import { usageRepository } from './repositories/usage.repository';

/** Computes the rolling-window bucket key a counter accrues into. LIFETIME never rotates. */
export function computePeriodKey(period: UsagePeriod, at: Date = new Date()): string {
  switch (period) {
    case 'DAILY':
      return at.toISOString().slice(0, 10); // YYYY-MM-DD
    case 'MONTHLY':
      return at.toISOString().slice(0, 7); // YYYY-MM
    case 'LIFETIME':
    default:
      return 'LIFETIME';
  }
}

export class UsageService {
  public async getCurrentCount(userId: string, metric: UsageMetric, period: UsagePeriod): Promise<number> {
    return usageRepository.getCount(userId, metric, period, computePeriodKey(period));
  }

  public async increment(
    userId: string,
    metric: UsageMetric,
    period: UsagePeriod,
    subscriptionId: string | null,
    amount = 1
  ): Promise<number> {
    return usageRepository.increment(userId, metric, period, computePeriodKey(period), subscriptionId, amount);
  }

  public async getAllCountersForUser(userId: string) {
    return usageRepository.listForUser(userId);
  }
}

export const usageService = new UsageService();
