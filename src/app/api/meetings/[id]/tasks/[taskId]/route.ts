import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { suggestedTaskService } from '@/features/meeting-intelligence';
import { AppError } from '@/errors';

export const dynamic = 'force-dynamic';

export async function PATCH(req: NextRequest, { params }: { params: { id: string; taskId: string } }) {
  try {
    const authUser = await getAuthUser(req);
    const body = await req.json().catch(() => ({}));

    const task = await suggestedTaskService.updateTaskSuggestion(authUser.id, params.taskId, body);

    return NextResponse.json({
      success: true,
      data: { task }
    });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(
        { success: false, error: { code: error.code, message: error.message } },
        { status: error.statusCode }
      );
    }
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to update task suggestion' } },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string; taskId: string } }) {
  try {
    const authUser = await getAuthUser(req);
    await suggestedTaskService.deleteTaskSuggestion(authUser.id, params.taskId);

    return NextResponse.json({
      success: true,
      data: { message: 'Task suggestion deleted successfully' }
    });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(
        { success: false, error: { code: error.code, message: error.message } },
        { status: error.statusCode }
      );
    }
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to delete task suggestion' } },
      { status: 500 }
    );
  }
}
