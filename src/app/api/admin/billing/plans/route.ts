import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser, requireRole } from '@/lib/auth';
import { UserRole } from '@prisma/client';
import { planService } from '@/features/billing';
import { AppError, ValidationError } from '@/errors';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const authUser = await requireAuthenticatedUser(req);
    requireRole(authUser, UserRole.ADMIN);

    const plans = await planService.listAllPlansForAdmin();
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

export async function POST(req: NextRequest) {
  try {
    const authUser = await requireAuthenticatedUser(req);
    requireRole(authUser, UserRole.ADMIN);

    const body = await req.json().catch(() => ({}));
    if (!body.code || !body.name || typeof body.monthlyPriceCents !== 'number' || typeof body.yearlyPriceCents !== 'number') {
      throw new ValidationError('code, name, monthlyPriceCents, and yearlyPriceCents are required.');
    }

    const plan = await planService.createPlan(
      {
        code: body.code,
        name: body.name,
        description: body.description,
        monthlyPriceCents: body.monthlyPriceCents,
        yearlyPriceCents: body.yearlyPriceCents,
        currency: body.currency,
        trialDays: body.trialDays,
        sortOrder: body.sortOrder
      },
      authUser.id
    );

    return NextResponse.json({ success: true, data: { plan } });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json({ success: false, error: { code: error.code, message: error.message } }, { status: error.statusCode });
    }
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to create plan' } },
      { status: 500 }
    );
  }
}
