import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser } from '@/lib/auth';
import { configService } from '@/features/config';
import { subscriptionService } from '@/features/billing';
import { AppError } from '@/errors';

export const dynamic = 'force-dynamic';

/** Returns the caller's own subscription only — never accepts a userId param, matching the tenant-isolation pattern used across every other user-scoped route in this app. */
export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(req);
    const billingEnabled = await configService.getBoolean('BILLING_ENABLED', false);

    if (!billingEnabled) {
      return NextResponse.json({ success: true, data: { billingEnabled: false, subscription: null } });
    }

    const subscription = await subscriptionService.getOrCreateForUser(user.id);
    return NextResponse.json({ success: true, data: { billingEnabled: true, subscription } });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json({ success: false, error: { code: error.code, message: error.message } }, { status: error.statusCode });
    }
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to load subscription' } },
      { status: 500 }
    );
  }
}
