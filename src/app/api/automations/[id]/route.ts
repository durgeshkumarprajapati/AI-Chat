import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser } from '@/lib/auth';
import { automationService, assertAutomationFeatureEnabled } from '@/features/automation/automation.service';
import { AutomationStatus } from '@prisma/client';

export const dynamic = 'force-dynamic';

/** GET /api/automations/[id] */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireAuthenticatedUser(req);
    await assertAutomationFeatureEnabled(user.id);

    const automation = await automationService.getAutomation(user.id, params.id);
    return NextResponse.json({ success: true, data: automation });
  } catch (err: any) {
    const status = typeof err?.statusCode === 'number' ? err.statusCode : 400;
    return NextResponse.json({ success: false, error: err.message }, { status });
  }
}

/** PATCH /api/automations/[id] — body may include { name?, description?, status? }. A `status`
 * transition to ACTIVE re-validates the current version's definition before allowing it. */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireAuthenticatedUser(req);
    await assertAutomationFeatureEnabled(user.id);

    const body = await req.json();
    let automation = await automationService.getAutomation(user.id, params.id);

    if (typeof body?.name === 'string' || typeof body?.description === 'string') {
      automation = await automationService.updateAutomationMetadata(user.id, params.id, {
        name: typeof body?.name === 'string' ? body.name : undefined,
        description: typeof body?.description === 'string' ? body.description : undefined
      });
    }

    if (typeof body?.status === 'string') {
      automation = await automationService.updateAutomationStatus(user.id, params.id, body.status as AutomationStatus);
    }

    return NextResponse.json({ success: true, data: automation });
  } catch (err: any) {
    const status = typeof err?.statusCode === 'number' ? err.statusCode : 400;
    return NextResponse.json({ success: false, error: err.message }, { status });
  }
}

/** DELETE /api/automations/[id] — never a hard delete; archives the automation (status=ARCHIVED,
 * isActive=false) so its execution history remains queryable. */
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireAuthenticatedUser(req);
    await assertAutomationFeatureEnabled(user.id);

    const automation = await automationService.archiveAutomation(user.id, params.id);
    return NextResponse.json({ success: true, data: automation });
  } catch (err: any) {
    const status = typeof err?.statusCode === 'number' ? err.statusCode : 400;
    return NextResponse.json({ success: false, error: err.message }, { status });
  }
}
