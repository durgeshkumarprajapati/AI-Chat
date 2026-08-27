import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { clickUpTaskService } from '@/features/meeting-intelligence';
import { AppError } from '@/errors';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: { id: string; taskId: string } }) {
  try {
    const authUser = await getAuthUser(req);
    const body = await req.json().catch(() => ({}));

    const result = await clickUpTaskService.createClickUpTaskFromSuggestion({
      userId: authUser.id,
      suggestionId: params.taskId,
      clickUpListId: body.clickUpListId,
      workspaceId: body.workspaceId
    });

    return NextResponse.json({
      success: true,
      data: result
    });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(
        { success: false, error: { code: error.code, message: error.message } },
        { status: error.statusCode }
      );
    }
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to create task in ClickUp' } },
      { status: 500 }
    );
  }
}
