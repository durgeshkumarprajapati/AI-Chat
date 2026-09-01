import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser } from '@/lib/auth';
import { automationService, assertAutomationFeatureEnabled } from '@/features/automation/automation.service';

export const dynamic = 'force-dynamic';

/** GET /api/automations/[id]/executions/[executionId] — full execution timeline incl. steps. */
export async function GET(req: NextRequest, { params }: { params: { id: string; executionId: string } }) {
  try {
    const user = await requireAuthenticatedUser(req);
    await assertAutomationFeatureEnabled(user.id);

    const execution = await automationService.getExecution(user.id, params.id, params.executionId);
    return NextResponse.json({ success: true, data: execution });
  } catch (err: any) {
    const status = typeof err?.statusCode === 'number' ? err.statusCode : 400;
    return NextResponse.json({ success: false, error: err.message }, { status });
  }
}
