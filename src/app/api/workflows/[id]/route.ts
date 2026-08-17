import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { workflowSessionService, workflowRepository } from '@/features/workflow';
import { AppError } from '@/errors';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthUser(req);
    const workflow = await workflowSessionService.getWorkflowDetails(user.id, params.id);
    return NextResponse.json({ success: true, data: workflow });
  } catch (err: any) {
    const status = err instanceof AppError ? err.statusCode : 500;
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to fetch workflow details' },
      { status }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthUser(req);
    await workflowRepository.deleteWorkflow(params.id, user.id);
    return NextResponse.json({ success: true, message: 'Workflow deleted' });
  } catch (err: any) {
    const status = err instanceof AppError ? err.statusCode : 500;
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to delete workflow' },
      { status }
    );
  }
}
