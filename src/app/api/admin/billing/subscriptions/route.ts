import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser, requireRole } from '@/lib/auth';
import { UserRole, SubscriptionStatus } from '@prisma/client';
import { subscriptionService } from '@/features/billing';
import { AppError } from '@/errors';

export const dynamic = 'force-dynamic';

const VALID_STATUSES: SubscriptionStatus[] = [
  'TRIALING',
  'ACTIVE',
  'PAST_DUE',
  'GRACE_PERIOD',
  'CANCEL_SCHEDULED',
  'CANCELED',
  'EXPIRED',
  'SUSPENDED',
  'INCOMPLETE'
];

/** Never returns Razorpay secrets — only the subscription/reference-ID fields already safe for admin display. */
export async function GET(req: NextRequest) {
  try {
    const authUser = await requireAuthenticatedUser(req);
    requireRole(authUser, UserRole.ADMIN);

    const { searchParams } = new URL(req.url);
    const page = Math.max(1, Number(searchParams.get('page')) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(searchParams.get('pageSize')) || 20));
    const statusParam = searchParams.get('status');
    const status = statusParam && VALID_STATUSES.includes(statusParam as SubscriptionStatus) ? (statusParam as SubscriptionStatus) : undefined;

    const { items, total } = await subscriptionService.listForAdmin({ page, pageSize, status });

    return NextResponse.json({
      success: true,
      data: {
        subscriptions: items.map((s: any) => ({
          id: s.id,
          userId: s.userId,
          userEmail: s.user?.email,
          userName: s.user?.name,
          planCode: s.plan.code,
          status: s.status,
          billingInterval: s.billingInterval,
          trialEndsAt: s.trialEndsAt,
          currentPeriodEnd: s.currentPeriodEnd,
          cancelAtPeriodEnd: s.cancelAtPeriodEnd,
          razorpaySubscriptionId: s.razorpaySubscriptionId
        })),
        page,
        pageSize,
        total
      }
    });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json({ success: false, error: { code: error.code, message: error.message } }, { status: error.statusCode });
    }
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to list subscriptions' } },
      { status: 500 }
    );
  }
}
