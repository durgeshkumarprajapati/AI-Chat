import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser } from '@/lib/auth';
import { billingService } from '@/features/billing';
import { AppError, ValidationError } from '@/errors';
import { PlanCode, BillingInterval } from '@prisma/client';

export const dynamic = 'force-dynamic';

const VALID_PLAN_CODES: PlanCode[] = ['FREE', 'PRO', 'PREMIUM'];
const VALID_INTERVALS: BillingInterval[] = ['MONTHLY', 'YEARLY'];

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(req);
    const body = await req.json().catch(() => ({}));

    if (!VALID_PLAN_CODES.includes(body.planCode)) {
      throw new ValidationError('A valid planCode (FREE, PRO, PREMIUM) is required.');
    }
    if (!VALID_INTERVALS.includes(body.billingInterval)) {
      throw new ValidationError('A valid billingInterval (MONTHLY, YEARLY) is required.');
    }

    const result = await billingService.initiateCheckout({
      userId: user.id,
      planCode: body.planCode,
      billingInterval: body.billingInterval
    });

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json({ success: false, error: { code: error.code, message: error.message } }, { status: error.statusCode });
    }
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to initiate checkout' } },
      { status: 500 }
    );
  }
}
