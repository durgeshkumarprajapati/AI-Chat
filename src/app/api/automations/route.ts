import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser } from '@/lib/auth';
import { automationService, assertAutomationFeatureEnabled } from '@/features/automation/automation.service';
import { AutomationStatus } from '@prisma/client';

export const dynamic = 'force-dynamic';

/** GET /api/automations — lists the current user's own private automations, or a project's
 * automations when ?projectId= is given (project membership is re-verified inside the service —
 * a client-supplied projectId is never trusted as proof of access). */
export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(req);
    await assertAutomationFeatureEnabled(user.id);

    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status') || undefined;
    const projectId = searchParams.get('projectId') || undefined;

    const automations = await automationService.listAutomations(user.id, {
      status: status as AutomationStatus | undefined,
      projectId
    });

    return NextResponse.json({ success: true, data: automations });
  } catch (err: any) {
    const status = typeof err?.statusCode === 'number' ? err.statusCode : 400;
    return NextResponse.json({ success: false, error: err.message }, { status });
  }
}

/** POST /api/automations — creates a new DRAFT automation with its v1 AutomationVersion. Body:
 * { name, description?, projectId?, definition }. `definition` is validated against the closed
 * node registry (AUTOMATION_NODE_REGISTRY) before anything is persisted. */
export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(req);
    await assertAutomationFeatureEnabled(user.id);

    const body = await req.json();
    const automation = await automationService.createAutomation(user.id, {
      name: typeof body?.name === 'string' ? body.name : '',
      description: typeof body?.description === 'string' ? body.description : undefined,
      projectId: typeof body?.projectId === 'string' ? body.projectId : undefined,
      definition: body?.definition
    });

    return NextResponse.json({ success: true, data: automation }, { status: 201 });
  } catch (err: any) {
    const status = typeof err?.statusCode === 'number' ? err.statusCode : 400;
    return NextResponse.json({ success: false, error: err.message }, { status });
  }
}
