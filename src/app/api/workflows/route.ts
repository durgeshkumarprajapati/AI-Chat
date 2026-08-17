import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { workflowSessionService } from '@/features/workflow';
import { AppError } from '@/errors';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    const body = await req.json();

    if (body.prompt) {
      const workflow = await workflowSessionService.generateWorkflowWithAI(user.id, body.prompt, body.name);
      return NextResponse.json({ success: true, data: workflow }, { status: 201 });
    }

    const workflow = await workflowSessionService.createWorkflow(user.id, body);
    return NextResponse.json({ success: true, data: workflow }, { status: 201 });
  } catch (err: any) {
    const status = err instanceof AppError ? err.statusCode : 500;
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to create workflow' },
      { status }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    const workflows = await workflowSessionService.getUserWorkflows(user.id);
    return NextResponse.json({ success: true, data: workflows });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to fetch workflows' },
      { status: 500 }
    );
  }
}
