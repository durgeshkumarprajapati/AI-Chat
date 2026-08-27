import { PlanCode } from '@prisma/client';
import { planRepository } from './repositories/plan.repository';
import { redis } from '@/lib/redis';
import { auditService } from '@/features/audit/audit.service';
import { billingTelemetryService } from './billing.telemetry.service';
import { NotFoundError, ValidationError } from '@/errors';
import { PlanDTO } from './billing.types';

const PLAN_CACHE_PREFIX = 'docai:billing:plan:';
const PLAN_LIST_CACHE_KEY = 'docai:billing:plans:active';
const PLAN_CACHE_TTL_SECONDS = 300;

function toDTO(plan: any): PlanDTO {
  return {
    id: plan.id,
    code: plan.code,
    name: plan.name,
    description: plan.description,
    isActive: plan.isActive,
    monthlyPriceCents: plan.monthlyPriceCents,
    yearlyPriceCents: plan.yearlyPriceCents,
    currency: plan.currency,
    trialDays: plan.trialDays,
    sortOrder: plan.sortOrder,
    features: plan.features.map((f: any) => ({ featureCode: f.featureCode, isEnabled: f.isEnabled })),
    limits: plan.limits.map((l: any) => ({ metric: l.metric, limit: l.limit, isUnlimited: l.isUnlimited, period: l.period }))
  };
}

export class PlanService {
  /** Public plan list for /pricing and /billing — always cached, never exposes Razorpay plan IDs. */
  public async listActivePlans(): Promise<PlanDTO[]> {
    try {
      const cached = await redis.getJson<PlanDTO[]>(PLAN_LIST_CACHE_KEY);
      if (cached) return cached;
    } catch {
      // Redis unavailable — fall through to DB read, matching ConfigCacheService's degrade-gracefully pattern.
    }

    const plans = (await planRepository.findActive()).map(toDTO);
    try {
      await redis.setJson(PLAN_LIST_CACHE_KEY, plans, PLAN_CACHE_TTL_SECONDS);
    } catch {
      // best-effort cache write
    }
    return plans;
  }

  public async listAllPlansForAdmin(): Promise<PlanDTO[]> {
    return (await planRepository.findAll()).map(toDTO);
  }

  public async getPlanByCode(code: PlanCode): Promise<PlanDTO> {
    const cacheKey = `${PLAN_CACHE_PREFIX}${code}`;
    try {
      const cached = await redis.getJson<PlanDTO>(cacheKey);
      if (cached) return cached;
    } catch {
      // ignore
    }

    const plan = await planRepository.findByCode(code);
    if (!plan) throw new NotFoundError(`Plan "${code}"`);
    const dto = toDTO(plan);
    try {
      await redis.setJson(cacheKey, dto, PLAN_CACHE_TTL_SECONDS);
    } catch {
      // ignore
    }
    return dto;
  }

  public async getPlanById(id: string): Promise<PlanDTO> {
    const plan = await planRepository.findById(id);
    if (!plan) throw new NotFoundError('Plan');
    return toDTO(plan);
  }

  public async createPlan(
    input: {
      code: PlanCode;
      name: string;
      description?: string;
      monthlyPriceCents: number;
      yearlyPriceCents: number;
      currency?: string;
      trialDays?: number;
      sortOrder?: number;
    },
    actorId: string
  ): Promise<PlanDTO> {
    if (input.monthlyPriceCents < 0 || input.yearlyPriceCents < 0) {
      throw new ValidationError('Plan prices cannot be negative.');
    }
    const existing = await planRepository.findByCode(input.code);
    if (existing) {
      throw new ValidationError(`Plan code "${input.code}" already exists.`);
    }

    const created = await planRepository.create({
      code: input.code,
      name: input.name,
      description: input.description ?? null,
      monthlyPriceCents: input.monthlyPriceCents,
      yearlyPriceCents: input.yearlyPriceCents,
      currency: input.currency ?? 'INR',
      trialDays: input.trialDays ?? 0,
      sortOrder: input.sortOrder ?? 0
    });

    await this.invalidateCache(input.code);
    await auditService.logEvent({
      actorId,
      action: 'PLAN_CREATED',
      targetType: 'SUBSCRIPTION_PLAN',
      targetId: created.id,
      details: { code: created.code, monthlyPriceCents: created.monthlyPriceCents }
    });
    billingTelemetryService.logEvent({ event: 'plan.created', planCode: created.code });

    return toDTO(created);
  }

  /**
   * Updates plan metadata/pricing. Never mutates an already-active UserSubscription's own
   * `planId`/pricing snapshot — existing subscribers keep whatever terms they were on until
   * their next renewal, per the spec's "plan changes must not silently alter existing
   * subscriptions" requirement.
   */
  public async updatePlan(
    id: string,
    input: Partial<{
      name: string;
      description: string | null;
      isActive: boolean;
      monthlyPriceCents: number;
      yearlyPriceCents: number;
      currency: string;
      trialDays: number;
      sortOrder: number;
    }>,
    actorId: string
  ): Promise<PlanDTO> {
    const existing = await planRepository.findById(id);
    if (!existing) throw new NotFoundError('Plan');

    const updated = await planRepository.update(id, input);
    await this.invalidateCache(existing.code);

    await auditService.logEvent({
      actorId,
      action: 'PLAN_UPDATED',
      targetType: 'SUBSCRIPTION_PLAN',
      targetId: id,
      details: { code: existing.code, changes: input }
    });
    billingTelemetryService.logEvent({ event: 'plan.updated', planCode: existing.code });

    return toDTO(updated);
  }

  public async setFeature(planId: string, featureCode: string, isEnabled: boolean, actorId: string): Promise<void> {
    const plan = await planRepository.findById(planId);
    if (!plan) throw new NotFoundError('Plan');

    await planRepository.upsertFeature(planId, featureCode, isEnabled);
    await this.invalidateCache(plan.code);

    await auditService.logEvent({
      actorId,
      action: 'PLAN_FEATURE_UPDATED',
      targetType: 'SUBSCRIPTION_PLAN',
      targetId: planId,
      details: { featureCode, isEnabled }
    });
  }

  public async setLimit(
    planId: string,
    metric: string,
    data: { limit?: number | null; isUnlimited?: boolean; period?: string },
    actorId: string
  ): Promise<void> {
    const plan = await planRepository.findById(planId);
    if (!plan) throw new NotFoundError('Plan');

    await planRepository.upsertLimit(planId, metric, data);
    await this.invalidateCache(plan.code);

    await auditService.logEvent({
      actorId,
      action: 'PLAN_LIMIT_UPDATED',
      targetType: 'SUBSCRIPTION_PLAN',
      targetId: planId,
      details: { metric, ...data }
    });
  }

  private async invalidateCache(code: PlanCode): Promise<void> {
    try {
      await redis.del(`${PLAN_CACHE_PREFIX}${code}`);
      await redis.del(PLAN_LIST_CACHE_KEY);
    } catch (err) {
      console.warn('[PlanService] Cache invalidation failed:', err);
    }
  }
}

export const planService = new PlanService();
