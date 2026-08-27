import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser, requireRole } from '@/lib/auth';
import { UserRole } from '@prisma/client';
import { configService } from '@/features/config';
import { subscriptionService, razorpayProvider } from '@/features/billing';
import { prisma } from '@/lib/prisma';
import { AppError } from '@/errors';
import { withApiTiming } from '@/features/performance/perf-telemetry.service';

export const dynamic = 'force-dynamic';

/**
 * Never fabricates revenue figures: MRR/ARR are computed from real ACTIVE subscriptions' plan
 * pricing (yearly normalized to /12), so both are honestly 0 while BILLING_ENABLED=false and no
 * subscriptions exist.
 */
async function handleGet(req: NextRequest) {
  try {
    const authUser = await requireAuthenticatedUser(req);
    requireRole(authUser, UserRole.ADMIN);

    // Phase 77: activeSubs never depended on the other four values — folded into the same
    // Promise.all instead of a separate sequential round trip. Identical data, lower latency.
    const [billingEnabled, razorpayEnabled, snapshot, totalUsers, activeSubs] = await Promise.all([
      configService.getBoolean('BILLING_ENABLED', false),
      configService.getBoolean('RAZORPAY_ENABLED', false),
      subscriptionService.getMetricsSnapshot(),
      prisma.user.count(),
      prisma.userSubscription.findMany({
        where: { status: 'ACTIVE' },
        select: { billingInterval: true, plan: { select: { monthlyPriceCents: true, yearlyPriceCents: true } } }
      })
    ]);

    const mrrCents = activeSubs.reduce((sum, s) => {
      const monthlyEquivalent = s.billingInterval === 'YEARLY' ? Math.round(s.plan.yearlyPriceCents / 12) : s.plan.monthlyPriceCents;
      return sum + monthlyEquivalent;
    }, 0);

    return NextResponse.json({
      success: true,
      data: {
        billingIntegration: {
          billingEnabled,
          razorpayEnabled,
          razorpayConfigured: razorpayProvider.isConfigured()
        },
        totalUsers,
        trialUsers: snapshot.trialUsers,
        activeSubscriptions: snapshot.activeSubscriptions,
        pastDueUsers: snapshot.pastDueUsers,
        canceledOrExpired: snapshot.canceledOrExpired,
        mrrCents,
        arrCents: mrrCents * 12
      }
    });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json({ success: false, error: { code: error.code, message: error.message } }, { status: error.statusCode });
    }
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to load billing metrics' } },
      { status: 500 }
    );
  }
}

// Phase 77: pure timing wrapper — same handler, same inputs/outputs/error behavior, records
// duration and warns on slow requests via the new perf telemetry service.
export const GET = withApiTiming('admin.billing.metrics', handleGet);
