import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser } from '@/lib/auth';
import { automationService, assertAutomationFeatureEnabled } from '@/features/automation/automation.service';

export const dynamic = 'force-dynamic';

/** POST /api/automations/[id]/versions — publishes a new IMMUTABLE AutomationVersion. Body:
 * { definition }. Never retroactively changes any existing AutomationExecution's
 * automationVersionId — see automation.service.ts's publishVersion() doc. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireAuthenticatedUser(req);
    await assertAutomationFeatureEnabled(user.id);

    const body = await req.json();
    const version = await automationService.publishVersion(user.id, params.id, body?.definition);

    return NextResponse.json({ success: true, data: version }, { status: 201 });
  } catch (err: any) {
    const status = typeof err?.statusCode === 'number' ? err.statusCode : 400;
    return NextResponse.json({ success: false, error: err.message }, { status });
  }
}
