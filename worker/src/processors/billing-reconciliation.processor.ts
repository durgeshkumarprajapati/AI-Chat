import { prisma } from '../lib/prisma.js';
import { subscriptionService } from '@/features/billing';
import { configService } from '@/features/config';

/**
 * Periodic billing reconciliation — trial expiry, grace-period entry/exit. Every transition
 * goes through subscriptionService.transition() (never a raw prisma status write) so the state
 * machine validation and audit logging in subscription.service.ts stay the single source of
 * truth, matching this worker's existing calendar-sync.processor.ts pattern of "processors query
 * candidates directly, then hand off to the domain service to mutate state."
 *
 * A no-op while BILLING_ENABLED=false: no UserSubscription rows exist yet on that path (see
 * entitlement.service.ts), so every query below returns empty. Usage-period resets need no code
 * here — UsageCounter rows are keyed by a rolling period bucket (see usage.service.ts's
 * computePeriodKey), so a new month/day simply starts a fresh counter rather than requiring an
 * explicit reset pass.
 */
export class BillingReconciliationProcessor {
  public async run(): Promise<{ trialsExpired: number; graceStarted: number; graceExpired: number }> {
    const billingEnabled = await configService.getBoolean('BILLING_ENABLED', false);
    if (!billingEnabled) {
      return { trialsExpired: 0, graceStarted: 0, graceExpired: 0 };
    }

    const now = new Date();
    const gracePeriodDays = await configService.getNumber('BILLING_GRACE_PERIOD_DAYS', 3);

    let trialsExpired = 0;
    const expiredTrials = await prisma.userSubscription.findMany({
      where: { status: 'TRIALING', trialEndsAt: { lte: now } },
      take: 100
    });
    if (expiredTrials.length > 0) {
      const freePlan = await prisma.subscriptionPlan.findUnique({ where: { code: 'FREE' } });
      for (const sub of expiredTrials) {
        try {
          if (freePlan) {
            await prisma.userSubscription.update({ where: { id: sub.id }, data: { planId: freePlan.id } });
          }
          await subscriptionService.transition(sub.id, 'EXPIRED', { details: { via: 'reconciliation', reason: 'trial_ended' } });
          trialsExpired++;
        } catch (err) {
          console.error(`[BillingReconciliation] Failed to expire trial for subscription ${sub.id}:`, err);
        }
      }
    }

    let graceStarted = 0;
    const newlyPastDue = await prisma.userSubscription.findMany({
      where: { status: 'PAST_DUE', gracePeriodEndsAt: null },
      take: 100
    });
    for (const sub of newlyPastDue) {
      try {
        const gracePeriodEndsAt = new Date(now.getTime() + gracePeriodDays * 24 * 60 * 60 * 1000);
        await prisma.userSubscription.update({ where: { id: sub.id }, data: { gracePeriodEndsAt } });
        await subscriptionService.transition(sub.id, 'GRACE_PERIOD', { details: { via: 'reconciliation', gracePeriodEndsAt } });
        graceStarted++;
      } catch (err) {
        console.error(`[BillingReconciliation] Failed to start grace period for subscription ${sub.id}:`, err);
      }
    }

    let graceExpired = 0;
    const expiredGrace = await prisma.userSubscription.findMany({
      where: { status: 'GRACE_PERIOD', gracePeriodEndsAt: { lte: now } },
      take: 100
    });
    for (const sub of expiredGrace) {
      try {
        await subscriptionService.transition(sub.id, 'EXPIRED', { details: { via: 'reconciliation', reason: 'grace_period_ended' } });
        graceExpired++;
      } catch (err) {
        console.error(`[BillingReconciliation] Failed to expire grace period for subscription ${sub.id}:`, err);
      }
    }

    return { trialsExpired, graceStarted, graceExpired };
  }
}

export const billingReconciliationProcessor = new BillingReconciliationProcessor();
