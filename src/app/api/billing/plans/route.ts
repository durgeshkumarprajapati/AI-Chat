import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser } from '@/lib/auth';
import { planService } from '@/features/billing';
import { AppError } from '@/errors';

export const dynamic = 'force-dynamic';

/** Public plan catalog — every authenticated user can view pricing regardless of BILLING_ENABLED. */
export async function GET(req: NextRequest) {
  try {
    await requireAuthenticatedUser(req);
    const plans = await planService.listActivePlans();
    return NextResponse.json({ success: true, data: { plans } });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json({ success: false, error: { code: error.code, message: error.message } }, { status: error.statusCode });
    }
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to list plans' } },
      { status: 500 }
    );
  }
}
