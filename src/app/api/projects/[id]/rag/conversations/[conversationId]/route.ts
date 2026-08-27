import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { projectRagService } from '@/features/projects/project-rag.service';
import { AppError } from '@/errors';

export const dynamic = 'force-dynamic';

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; conversationId: string } }
) {
  try {
    const authUser = await getAuthUser(req);
    const body = await req.json();
    const result = await projectRagService.updateProjectConversation(
      authUser.id,
      params.id,
      params.conversationId,
      body.title
    );
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(
        { success: false, error: { code: error.code, message: error.message } },
        { status: error.statusCode }
      );
    }
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to update project conversation' } },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string; conversationId: string } }
) {
  try {
    const authUser = await getAuthUser(req);
    await projectRagService.deleteProjectConversation(
      authUser.id,
      params.id,
      params.conversationId
    );
    return NextResponse.json({ success: true, message: 'Conversation deleted' });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(
        { success: false, error: { code: error.code, message: error.message } },
        { status: error.statusCode }
      );
    }
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to delete project conversation' } },
      { status: 500 }
    );
  }
}
