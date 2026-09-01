import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser } from '@/lib/auth';
import { automationService, assertAutomationFeatureEnabled } from '@/features/automation/automation.service';
import { AutomationTriggerType } from '@prisma/client';

export const dynamic = 'force-dynamic';

/** GET /api/automations/[id]/trigger-bindings */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireAuthenticatedUser(req);
    await assertAutomationFeatureEnabled(user.id);

    const bindings = await automationService.listTriggerBindings(user.id, params.id);
    return NextResponse.json({ success: true, data: bindings });
  } catch (err: any) {
    const status = typeof err?.statusCode === 'number' ? err.statusCode : 400;
    return NextResponse.json({ success: false, error: err.message }, { status });
  }
}

/** POST /api/automations/[id]/trigger-bindings — body: { triggerType, filterJson? }. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireAuthenticatedUser(req);
    await assertAutomationFeatureEnabled(user.id);

    const body = await req.json();
    const triggerType = body?.triggerType as AutomationTriggerType;
    if (!triggerType) {
      return NextResponse.json({ success: false, error: 'A "triggerType" is required.' }, { status: 400 });
    }

    const binding = await automationService.createTriggerBinding(user.id, params.id, {
      triggerType,
      filterJson: body?.filterJson && typeof body.filterJson === 'object' ? body.filterJson : undefined
    });

    return NextResponse.json({ success: true, data: binding }, { status: 201 });
  } catch (err: any) {
    const status = typeof err?.statusCode === 'number' ? err.statusCode : 400;
    return NextResponse.json({ success: false, error: err.message }, { status });
  }
}
