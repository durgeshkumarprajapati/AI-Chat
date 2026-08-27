import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { projectRagService } from '@/features/projects/project-rag.service';
import { AppError } from '@/errors';

export const dynamic = 'force-dynamic';

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string; sourceId: string } }
) {
  try {
    const authUser = await getAuthUser(req);
    await projectRagService.detachKnowledgeBaseSource(
      authUser.id,
      params.id,
      params.sourceId
    );
    return NextResponse.json({ success: true, message: 'Knowledge Base detached' });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(
        { success: false, error: { code: error.code, message: error.message } },
        { status: error.statusCode }
      );
    }
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to detach Knowledge Base' } },
      { status: 500 }
    );
  }
}
