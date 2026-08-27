import { FeatureCode, UsageMetric } from '@prisma/client';
import { configService } from '@/features/config';
import { redis } from '@/lib/redis';
import { subscriptionService } from './subscription.service';
import { planService } from './plan.service';
import { usageService } from './usage.service';
import { auditService } from '@/features/audit/audit.service';
import { billingTelemetryService } from './billing.telemetry.service';
import { AuthorizationError } from '@/errors';
import { EntitlementSnapshot, UsageCheckResult } from './billing.types';
import { entitlementCacheKey } from './billing-cache-keys';

const ENTITLEMENT_CACHE_TTL_SECONDS = 60;

/**
 * The single centralized gate for every plan/feature/usage decision in the application. No
 * other module should compare `user.role`/plan codes directly — call
 * entitlementService.canAccessFeature()/requireFeature() instead, so a future plan or feature
 * can be added without touching the feature's own code.
 *
 * BILLING_ENABLED=false (the default) makes every method below resolve to "allowed" without
 * touching the database — this is what guarantees zero regression for existing users while
 * billing is off. Only when BILLING_ENABLED=true does this service provision/read a real
 * UserSubscription row.
 */
export class EntitlementService {
  public async isBillingEnabled(): Promise<boolean> {
    return configService.getBoolean('BILLING_ENABLED', false);
  }

  public async canAccessFeature(userId: string, featureCode: FeatureCode): Promise<boolean> {
    const billingEnabled = await this.isBillingEnabled();
    if (!billingEnabled) return true;

    const snapshot = await this.getUserEntitlements(userId);
    return snapshot.features[featureCode] ?? false;
  }

  public async requireFeature(userId: string, featureCode: FeatureCode): Promise<void> {
    const allowed = await this.canAccessFeature(userId, featureCode);
    if (allowed) return;

    const snapshot = await this.getUserEntitlements(userId);
    await auditService.logEvent({
      actorId: userId,
      action: 'ENTITLEMENT_DENIED',
      targetType: 'FEATURE',
      targetId: featureCode,
      details: { planCode: snapshot.planCode, status: snapshot.status }
    });
    billingTelemetryService.logEvent({ event: 'entitlement.denied', userId, featureCode });

    throw new AuthorizationError(
      `This feature is available on a higher plan. Current plan: ${snapshot.planCode}.`
    );
  }

  public async getUserEntitlements(userId: string): Promise<EntitlementSnapshot> {
    const billingEnabled = await this.isBillingEnabled();
    if (!billingEnabled) {
      return {
        userId,
        planCode: 'PREMIUM',
        status: 'ACTIVE',
        billingBypassed: true,
        features: {},
        computedAt: new Date().toISOString()
      };
    }

    const cacheKey = entitlementCacheKey(userId);
    try {
      const cached = await redis.getJson<EntitlementSnapshot>(cacheKey);
      if (cached) return cached;
    } catch {
      // ignore, fall through to DB
    }

    const subscription = await subscriptionService.getOrCreateForUser(userId);
    const plan = await planService.getPlanByCode(subscription.planCode);

    const isUsable = subscription.status === 'ACTIVE' || subscription.status === 'TRIALING' || subscription.status === 'GRACE_PERIOD';
    const features: Record<string, boolean> = {};
    for (const f of plan.features) {
      features[f.featureCode] = isUsable && f.isEnabled;
    }

    const snapshot: EntitlementSnapshot = {
      userId,
      planCode: subscription.planCode,
      status: subscription.status,
      billingBypassed: false,
      features,
      computedAt: new Date().toISOString()
    };

    try {
      await redis.setJson(cacheKey, snapshot, ENTITLEMENT_CACHE_TTL_SECONDS);
    } catch {
      // best-effort
    }

    return snapshot;
  }

  public async getPlanEntitlements(planCode: EntitlementSnapshot['planCode']) {
    return planService.getPlanByCode(planCode);
  }

  public async invalidateUserEntitlements(userId: string): Promise<void> {
    try {
      await redis.del(entitlementCacheKey(userId));
    } catch (err) {
      console.warn('[EntitlementService] Cache invalidation failed:', err);
    }
  }

  /** Read-only check — does not record usage. Use consumeUsage() to both check and record atomically. */
  public async checkUsageLimit(userId: string, metric: UsageMetric): Promise<UsageCheckResult> {
    const billingEnabled = await this.isBillingEnabled();
    if (!billingEnabled) {
      return { allowed: true, metric, period: 'MONTHLY', currentCount: 0, limit: null, isUnlimited: true, enforced: false };
    }

    const enforcementEnabled = await configService.getBoolean('BILLING_USAGE_ENFORCEMENT_ENABLED', false);
    const subscription = await subscriptionService.getOrCreateForUser(userId);
    const plan = await planService.getPlanByCode(subscription.planCode);
    const limitRow = plan.limits.find((l) => l.metric === metric);

    if (!limitRow || limitRow.isUnlimited) {
      return { allowed: true, metric, period: limitRow?.period ?? 'MONTHLY', currentCount: 0, limit: null, isUnlimited: true, enforced: enforcementEnabled };
    }

    const currentCount = await usageService.getCurrentCount(userId, metric, limitRow.period);
    const limit = limitRow.limit ?? 0;
    const withinLimit = currentCount < limit;

    return {
      allowed: enforcementEnabled ? withinLimit : true,
      metric,
      period: limitRow.period,
      currentCount,
      limit,
      isUnlimited: false,
      enforced: enforcementEnabled
    };
  }

  /** Checks the limit and, if allowed, atomically records `amount` of usage. Never double-charges a denied request. */
  public async consumeUsage(userId: string, metric: UsageMetric, amount = 1): Promise<UsageCheckResult> {
    const billingEnabled = await this.isBillingEnabled();
    if (!billingEnabled) {
      return { allowed: true, metric, period: 'MONTHLY', currentCount: 0, limit: null, isUnlimited: true, enforced: false };
    }

    const check = await this.checkUsageLimit(userId, metric);
    if (check.enforced && !check.allowed) {
      await auditService.logEvent({
        actorId: userId,
        action: 'ENTITLEMENT_DENIED',
        targetType: 'USAGE_METRIC',
        targetId: metric,
        details: { currentCount: check.currentCount, limit: check.limit }
      });
      return check;
    }

    const subscription = await subscriptionService.getOrCreateForUser(userId);
    const newCount = check.isUnlimited
      ? check.currentCount
      : await usageService.increment(userId, metric, check.period, subscription.id, amount);

    return { ...check, currentCount: check.isUnlimited ? check.currentCount : newCount, allowed: true };
  }
}

export const entitlementService = new EntitlementService();
