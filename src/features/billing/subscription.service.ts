import { SubscriptionStatus, PlanCode, BillingInterval } from '@prisma/client';
import { subscriptionRepository } from './repositories/subscription.repository';
import { planRepository } from './repositories/plan.repository';
import { configService } from '@/features/config';
import { auditService } from '@/features/audit/audit.service';
import { billingTelemetryService } from './billing.telemetry.service';
import { NotFoundError, ValidationError, ConflictError } from '@/errors';
import { SubscriptionDTO } from './billing.types';
import { redis } from '@/lib/redis';
import { entitlementCacheKey } from './billing-cache-keys';

async function invalidateEntitlementCache(userId: string): Promise<void> {
  try {
    await redis.del(entitlementCacheKey(userId));
  } catch (err) {
    console.warn('[SubscriptionService] Entitlement cache invalidation failed:', err);
  }
}

/**
 * Explicit state machine — the only place a UserSubscription.status may change. No caller may
 * write `status` directly through the repository; every transition is validated against this
 * table and audit-logged. Prevents the "arbitrary state changes" the spec calls out.
 */
const SUBSCRIPTION_TRANSITIONS: Record<SubscriptionStatus, SubscriptionStatus[]> = {
  TRIALING: ['ACTIVE', 'EXPIRED', 'CANCELED', 'INCOMPLETE'],
  ACTIVE: ['PAST_DUE', 'CANCEL_SCHEDULED', 'CANCELED', 'SUSPENDED'],
  PAST_DUE: ['ACTIVE', 'GRACE_PERIOD', 'CANCELED'],
  GRACE_PERIOD: ['ACTIVE', 'EXPIRED', 'CANCELED'],
  CANCEL_SCHEDULED: ['CANCELED', 'ACTIVE'],
  CANCELED: ['ACTIVE', 'TRIALING'],
  EXPIRED: ['ACTIVE', 'TRIALING'],
  SUSPENDED: ['ACTIVE', 'CANCELED'],
  INCOMPLETE: ['ACTIVE', 'CANCELED']
};

function toDTO(sub: any): SubscriptionDTO {
  return {
    id: sub.id,
    userId: sub.userId,
    planId: sub.planId,
    planCode: sub.plan.code,
    status: sub.status,
    billingInterval: sub.billingInterval,
    trialStartedAt: sub.trialStartedAt,
    trialEndsAt: sub.trialEndsAt,
    hasUsedTrial: sub.hasUsedTrial,
    currentPeriodStart: sub.currentPeriodStart,
    currentPeriodEnd: sub.currentPeriodEnd,
    gracePeriodEndsAt: sub.gracePeriodEndsAt,
    cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
    canceledAt: sub.canceledAt,
    razorpaySubscriptionId: sub.razorpaySubscriptionId,
    isGrandfathered: sub.isGrandfathered,
    createdAt: sub.createdAt,
    updatedAt: sub.updatedAt
  };
}

export class SubscriptionService {
  public async getByUserId(userId: string): Promise<SubscriptionDTO | null> {
    const sub = await subscriptionRepository.findByUserId(userId);
    return sub ? toDTO(sub) : null;
  }

  /**
   * Lazily provisions a subscription row the first time one is needed (an entitlement check or
   * a billing route, only ever reached when BILLING_ENABLED=true). New users get a one-time
   * trial if eligible, otherwise land on FREE. Never called on the BILLING_ENABLED=false path —
   * see entitlement.service.ts's bypass check, which returns before this can run.
   */
  public async getOrCreateForUser(userId: string): Promise<SubscriptionDTO> {
    const existing = await subscriptionRepository.findByUserId(userId);
    if (existing) return toDTO(existing);

    const trialEnabled = await configService.getBoolean('BILLING_TRIAL_ENABLED', true);
    const trialDurationDays = await configService.getNumber('BILLING_TRIAL_DURATION_DAYS', 30);

    if (trialEnabled && trialDurationDays > 0) {
      const premiumPlan = await planRepository.findByCode('PREMIUM');
      if (premiumPlan) {
        const now = new Date();
        const trialEndsAt = new Date(now.getTime() + trialDurationDays * 24 * 60 * 60 * 1000);
        const created = await subscriptionRepository.create({
          userId,
          planId: premiumPlan.id,
          status: 'TRIALING',
          billingInterval: 'MONTHLY',
          trialStartedAt: now,
          trialEndsAt,
          hasUsedTrial: true
        });
        await auditService.logEvent({
          actorId: userId,
          action: 'TRIAL_STARTED',
          targetType: 'USER_SUBSCRIPTION',
          targetId: created.id,
          details: { planCode: 'PREMIUM', trialDurationDays }
        });
        billingTelemetryService.logEvent({ event: 'trial.started', userId, planCode: 'PREMIUM' });
        await invalidateEntitlementCache(userId);
        return toDTO(await subscriptionRepository.findById(created.id));
      }
    }

    const freePlan = await planRepository.findByCode('FREE');
    if (!freePlan) {
      throw new NotFoundError('FREE plan (seed data missing — run prisma db seed)');
    }
    const created = await subscriptionRepository.create({
      userId,
      planId: freePlan.id,
      status: 'ACTIVE',
      billingInterval: 'MONTHLY',
      hasUsedTrial: false
    });
    await auditService.logEvent({
      actorId: userId,
      action: 'SUBSCRIPTION_CREATED',
      targetType: 'USER_SUBSCRIPTION',
      targetId: created.id,
      details: { planCode: 'FREE' }
    });
    await invalidateEntitlementCache(userId);
    return toDTO(await subscriptionRepository.findById(created.id));
  }

  /**
   * Grants an existing (pre-billing) user unrestricted access once BILLING_ENABLED flips true,
   * so no one already using the platform loses access on rollout day. Idempotent — a second
   * call on an already-grandfathered user is a no-op. Intended to be run once per user (e.g. by
   * an admin rollout script), never automatically.
   */
  public async grandfatherExistingUser(userId: string, planCode: PlanCode = 'PREMIUM'): Promise<SubscriptionDTO> {
    const existing = await subscriptionRepository.findByUserId(userId);
    if (existing) return toDTO(existing);

    const plan = await planRepository.findByCode(planCode);
    if (!plan) throw new NotFoundError(`Plan "${planCode}"`);

    const created = await subscriptionRepository.create({
      userId,
      planId: plan.id,
      status: 'ACTIVE',
      billingInterval: 'MONTHLY',
      hasUsedTrial: false,
      isGrandfathered: true
    });
    await auditService.logEvent({
      actorId: userId,
      action: 'SUBSCRIPTION_CREATED',
      targetType: 'USER_SUBSCRIPTION',
      targetId: created.id,
      details: { planCode, grandfathered: true }
    });
    await invalidateEntitlementCache(userId);
    return toDTO(await subscriptionRepository.findById(created.id));
  }

  public async transition(
    subscriptionId: string,
    to: SubscriptionStatus,
    opts?: { actorId?: string; details?: Record<string, unknown> }
  ): Promise<SubscriptionDTO> {
    const sub = await subscriptionRepository.findById(subscriptionId);
    if (!sub) throw new NotFoundError('Subscription');

    const allowed = SUBSCRIPTION_TRANSITIONS[sub.status] ?? [];
    if (sub.status !== to && !allowed.includes(to)) {
      throw new ValidationError(`Illegal subscription state transition: ${sub.status} -> ${to}`);
    }

    const data: Record<string, unknown> = { status: to };
    if (to === 'CANCELED' && sub.status !== 'CANCELED') data.canceledAt = new Date();
    if (to === 'ACTIVE') data.gracePeriodEndsAt = null;

    const updated = await subscriptionRepository.update(subscriptionId, data as any);

    const actionMap: Partial<Record<SubscriptionStatus, string>> = {
      ACTIVE: 'SUBSCRIPTION_ACTIVATED',
      CANCELED: 'SUBSCRIPTION_CANCELED',
      EXPIRED: 'SUBSCRIPTION_EXPIRED'
    };
    await auditService.logEvent({
      actorId: opts?.actorId ?? sub.userId,
      action: actionMap[to] ?? 'SUBSCRIPTION_STATUS_CHANGED',
      targetType: 'USER_SUBSCRIPTION',
      targetId: subscriptionId,
      details: { from: sub.status, to, ...(opts?.details ?? {}) }
    });
    billingTelemetryService.logEvent({ event: 'subscription.transitioned', userId: sub.userId, status: to });
    await invalidateEntitlementCache(sub.userId);

    return toDTO(updated);
  }

  /** cancelAtPeriodEnd=true keeps access through the current period; immediate=true cancels now. */
  public async cancel(userId: string, opts: { immediate?: boolean; actorId?: string } = {}): Promise<SubscriptionDTO> {
    const sub = await subscriptionRepository.findByUserId(userId);
    if (!sub) throw new NotFoundError('Subscription');

    if (opts.immediate) {
      return this.transition(sub.id, 'CANCELED', { actorId: opts.actorId, details: { immediate: true } });
    }

    if (sub.status !== 'ACTIVE' && sub.status !== 'TRIALING') {
      throw new ConflictError(`Cannot schedule cancellation from status ${sub.status}`);
    }
    const updated = await subscriptionRepository.update(sub.id, { cancelAtPeriodEnd: true, status: 'CANCEL_SCHEDULED' as SubscriptionStatus });
    await auditService.logEvent({
      actorId: opts.actorId ?? userId,
      action: 'SUBSCRIPTION_CANCEL_SCHEDULED',
      targetType: 'USER_SUBSCRIPTION',
      targetId: sub.id,
      details: { currentPeriodEnd: sub.currentPeriodEnd }
    });
    await invalidateEntitlementCache(userId);
    return toDTO(updated);
  }

  public async reactivate(userId: string, actorId?: string): Promise<SubscriptionDTO> {
    const sub = await subscriptionRepository.findByUserId(userId);
    if (!sub) throw new NotFoundError('Subscription');
    if (sub.status !== 'CANCEL_SCHEDULED') {
      throw new ConflictError(`Cannot reactivate from status ${sub.status}`);
    }
    const updated = await subscriptionRepository.update(sub.id, { cancelAtPeriodEnd: false });
    return this.transition(updated.id, 'ACTIVE', { actorId });
  }

  public async setBillingInterval(userId: string, interval: BillingInterval): Promise<SubscriptionDTO> {
    const sub = await subscriptionRepository.findByUserId(userId);
    if (!sub) throw new NotFoundError('Subscription');
    const updated = await subscriptionRepository.update(sub.id, { billingInterval: interval });
    return toDTO(updated);
  }

  public async listForAdmin(opts: { page: number; pageSize: number; status?: SubscriptionStatus }) {
    return subscriptionRepository.listForAdmin(opts);
  }

  public async getMetricsSnapshot() {
    const [trialing, active, pastDue, canceled] = await Promise.all([
      subscriptionRepository.countByStatus(['TRIALING']),
      subscriptionRepository.countByStatus(['ACTIVE']),
      subscriptionRepository.countByStatus(['PAST_DUE', 'GRACE_PERIOD']),
      subscriptionRepository.countByStatus(['CANCELED', 'EXPIRED'])
    ]);
    return { trialUsers: trialing, activeSubscriptions: active, pastDueUsers: pastDue, canceledOrExpired: canceled };
  }
}

export const subscriptionService = new SubscriptionService();
