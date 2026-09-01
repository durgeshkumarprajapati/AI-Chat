import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser } from '@/lib/auth';
import { automationService, assertAutomationFeatureEnabled } from '@/features/automation/automation.service';

export const dynamic = 'force-dynamic';

/** DELETE /api/automations/[id]/trigger-bindings/[bindingId] */
export async function DELETE(req: NextRequest, { params }: { params: { id: string; bindingId: string } }) {
  try {
    const user = await requireAuthenticatedUser(req);
    await assertAutomationFeatureEnabled(user.id);

    await automationService.deleteTriggerBinding(user.id, params.id, params.bindingId);
    return NextResponse.json({ success: true, data: { deleted: true } });
  } catch (err: any) {
    const status = typeof err?.statusCode === 'number' ? err.statusCode : 400;
    return NextResponse.json({ success: false, error: err.message }, { status });
  }
}
