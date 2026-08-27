import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser } from '@/lib/auth';
import { billingService } from '@/features/billing';
import { AppError } from '@/errors';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(req);
    const subscription = await billingService.reactivateSubscription(user.id);
    return NextResponse.json({ success: true, data: { subscription } });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json({ success: false, error: { code: error.code, message: error.message } }, { status: error.statusCode });
    }
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to reactivate subscription' } },
      { status: 500 }
    );
  }
}
