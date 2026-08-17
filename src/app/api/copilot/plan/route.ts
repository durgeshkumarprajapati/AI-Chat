import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { copilotRouterService } from '@/features/copilot/agent/copilot-router.service';
import { copilotPlannerService } from '@/features/copilot/planning/copilot-planner.service';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    await getAuthUser(req);
    const body = await req.json();

    if (!body.query) {
      return NextResponse.json({ success: false, error: 'Query is required' }, { status: 400 });
    }

    const intentResult = copilotRouterService.classifyIntent(body.query, (body.documentIds?.length ?? 0) > 0);
    const plan = copilotPlannerService.generatePlan(body.query, intentResult.intent, body.documentIds, body.sourceMode);
    const validation = copilotPlannerService.validatePlan(plan);

    return NextResponse.json({
      success: true,
      data: {
        intent: intentResult,
        plan,
        validation
      }
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
