import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser } from '@/lib/auth';
import { configService } from '@/features/config';
import { subscriptionService, planService, usageService } from '@/features/billing';
import { AppError } from '@/errors';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(req);
    const billingEnabled = await configService.getBoolean('BILLING_ENABLED', false);

    if (!billingEnabled) {
      return NextResponse.json({ success: true, data: { billingEnabled: false, usage: [] } });
    }

    const subscription = await subscriptionService.getOrCreateForUser(user.id);
    const plan = await planService.getPlanByCode(subscription.planCode);

    const usage = await Promise.all(
      plan.limits.map(async (l) => ({
        metric: l.metric,
        period: l.period,
        limit: l.limit,
        isUnlimited: l.isUnlimited,
        currentCount: l.isUnlimited ? 0 : await usageService.getCurrentCount(user.id, l.metric, l.period)
      }))
    );

    return NextResponse.json({ success: true, data: { billingEnabled: true, usage } });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json({ success: false, error: { code: error.code, message: error.message } }, { status: error.statusCode });
    }
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to load usage' } },
      { status: 500 }
    );
  }
}
