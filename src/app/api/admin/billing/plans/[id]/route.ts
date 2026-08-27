import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser, requireRole } from '@/lib/auth';
import { UserRole } from '@prisma/client';
import { planService } from '@/features/billing';
import { AppError } from '@/errors';

export const dynamic = 'force-dynamic';

/**
 * Updates plan metadata/pricing and, optionally, its feature/limit rows in one call.
 * Never touches an existing UserSubscription's own planId — see plan.service.ts's
 * updatePlan() doc comment for why that would silently alter live subscribers' terms.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const authUser = await requireAuthenticatedUser(req);
    requireRole(authUser, UserRole.ADMIN);

    const body = await req.json().catch(() => ({}));

    const plan = await planService.updatePlan(
      params.id,
      {
        name: body.name,
        description: body.description,
        isActive: body.isActive,
        monthlyPriceCents: body.monthlyPriceCents,
        yearlyPriceCents: body.yearlyPriceCents,
        currency: body.currency,
        trialDays: body.trialDays,
        sortOrder: body.sortOrder
      },
      authUser.id
    );

    if (Array.isArray(body.features)) {
      for (const f of body.features) {
        if (f?.featureCode && typeof f.isEnabled === 'boolean') {
          await planService.setFeature(params.id, f.featureCode, f.isEnabled, authUser.id);
        }
      }
    }

    if (Array.isArray(body.limits)) {
      for (const l of body.limits) {
        if (l?.metric) {
          await planService.setLimit(params.id, l.metric, { limit: l.limit, isUnlimited: l.isUnlimited, period: l.period }, authUser.id);
        }
      }
    }

    const updatedPlan = await planService.getPlanById(params.id);
    return NextResponse.json({ success: true, data: { plan: updatedPlan ?? plan } });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json({ success: false, error: { code: error.code, message: error.message } }, { status: error.statusCode });
    }
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to update plan' } },
      { status: 500 }
    );
  }
}
