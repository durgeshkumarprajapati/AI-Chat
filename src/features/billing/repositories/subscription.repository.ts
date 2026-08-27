import { prisma } from '@/lib/prisma';
import { SubscriptionStatus, BillingInterval } from '@prisma/client';

export class SubscriptionRepository {
  public async findByUserId(userId: string) {
    return prisma.userSubscription.findUnique({
      where: { userId },
      include: { plan: { include: { features: true, limits: true } } }
    });
  }

  public async findById(id: string) {
    return prisma.userSubscription.findUnique({
      where: { id },
      include: { plan: { include: { features: true, limits: true } } }
    });
  }

  public async findByRazorpaySubscriptionId(razorpaySubscriptionId: string) {
    return prisma.userSubscription.findUnique({
      where: { razorpaySubscriptionId },
      include: { plan: { include: { features: true, limits: true } } }
    });
  }

  public async create(data: {
    userId: string;
    planId: string;
    status: SubscriptionStatus;
    billingInterval: BillingInterval;
    trialStartedAt?: Date | null;
    trialEndsAt?: Date | null;
    hasUsedTrial?: boolean;
    currentPeriodStart?: Date | null;
    currentPeriodEnd?: Date | null;
    isGrandfathered?: boolean;
  }) {
    return prisma.userSubscription.create({
      data,
      include: { plan: { include: { features: true, limits: true } } }
    });
  }

  public async update(
    id: string,
    data: Partial<{
      planId: string;
      status: SubscriptionStatus;
      billingInterval: BillingInterval;
      trialStartedAt: Date | null;
      trialEndsAt: Date | null;
      hasUsedTrial: boolean;
      currentPeriodStart: Date | null;
      currentPeriodEnd: Date | null;
      gracePeriodEndsAt: Date | null;
      cancelAtPeriodEnd: boolean;
      canceledAt: Date | null;
      razorpaySubscriptionId: string | null;
      razorpayCustomerId: string | null;
      metadata: Record<string, unknown>;
    }>
  ) {
    return prisma.userSubscription.update({
      where: { id },
      data: data as any,
      include: { plan: { include: { features: true, limits: true } } }
    });
  }

  public async listByStatus(statuses: SubscriptionStatus[], opts?: { take?: number; cursor?: string }) {
    return prisma.userSubscription.findMany({
      where: { status: { in: statuses } },
      include: { plan: true },
      take: opts?.take ?? 200,
      ...(opts?.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
      orderBy: { id: 'asc' }
    });
  }

  public async listForAdmin(opts: { page: number; pageSize: number; status?: SubscriptionStatus }) {
    const where = opts.status ? { status: opts.status } : {};
    const [items, total] = await Promise.all([
      prisma.userSubscription.findMany({
        where,
        // Phase 77: narrowed from `include: { plan: true }` — the admin route only ever reads
        // `plan.code`, not the full plan row (pricing, description, etc.).
        include: { plan: { select: { code: true } }, user: { select: { id: true, email: true, name: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (opts.page - 1) * opts.pageSize,
        take: opts.pageSize
      }),
      prisma.userSubscription.count({ where })
    ]);
    return { items, total };
  }

  public async countByStatus(statuses: SubscriptionStatus[]) {
    return prisma.userSubscription.count({ where: { status: { in: statuses } } });
  }
}

export const subscriptionRepository = new SubscriptionRepository();
