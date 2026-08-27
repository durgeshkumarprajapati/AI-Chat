import { prisma } from '@/lib/prisma';
import { PlanCode } from '@prisma/client';

export class PlanRepository {
  public async findActive() {
    return prisma.subscriptionPlan.findMany({
      where: { isActive: true },
      include: { features: true, limits: true },
      orderBy: { sortOrder: 'asc' }
    });
  }

  public async findAll() {
    return prisma.subscriptionPlan.findMany({
      include: { features: true, limits: true },
      orderBy: { sortOrder: 'asc' }
    });
  }

  public async findById(id: string) {
    return prisma.subscriptionPlan.findUnique({
      where: { id },
      include: { features: true, limits: true }
    });
  }

  public async findByCode(code: PlanCode) {
    return prisma.subscriptionPlan.findUnique({
      where: { code },
      include: { features: true, limits: true }
    });
  }

  public async create(data: {
    code: PlanCode;
    name: string;
    description?: string | null;
    isActive?: boolean;
    monthlyPriceCents: number;
    yearlyPriceCents: number;
    currency: string;
    trialDays: number;
    sortOrder: number;
    razorpayMonthlyPlanId?: string | null;
    razorpayYearlyPlanId?: string | null;
  }) {
    return prisma.subscriptionPlan.create({ data, include: { features: true, limits: true } });
  }

  public async update(
    id: string,
    data: Partial<{
      name: string;
      description: string | null;
      isActive: boolean;
      monthlyPriceCents: number;
      yearlyPriceCents: number;
      currency: string;
      trialDays: number;
      sortOrder: number;
      razorpayMonthlyPlanId: string | null;
      razorpayYearlyPlanId: string | null;
    }>
  ) {
    return prisma.subscriptionPlan.update({ where: { id }, data, include: { features: true, limits: true } });
  }

  public async upsertFeature(planId: string, featureCode: string, isEnabled: boolean) {
    return prisma.subscriptionPlanFeature.upsert({
      where: { planId_featureCode: { planId, featureCode: featureCode as any } },
      create: { planId, featureCode: featureCode as any, isEnabled },
      update: { isEnabled }
    });
  }

  public async upsertLimit(
    planId: string,
    metric: string,
    data: { limit?: number | null; isUnlimited?: boolean; period?: string }
  ) {
    return prisma.subscriptionPlanLimit.upsert({
      where: { planId_metric: { planId, metric: metric as any } },
      create: {
        planId,
        metric: metric as any,
        limit: data.limit ?? null,
        isUnlimited: data.isUnlimited ?? false,
        period: (data.period as any) ?? 'MONTHLY'
      },
      update: {
        ...(data.limit !== undefined ? { limit: data.limit } : {}),
        ...(data.isUnlimited !== undefined ? { isUnlimited: data.isUnlimited } : {}),
        ...(data.period !== undefined ? { period: data.period as any } : {})
      }
    });
  }
}

export const planRepository = new PlanRepository();
