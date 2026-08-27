import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { projectRagService } from '@/features/projects/project-rag.service';
import { AppError } from '@/errors';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const authUser = await getAuthUser(req);
    const body = await req.json();
    await projectRagService.attachKnowledgeBaseSource(
      authUser.id,
      params.id,
      body.knowledgeBaseId
    );
    return NextResponse.json({ success: true, message: 'Knowledge Base attached' }, { status: 201 });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(
        { success: false, error: { code: error.code, message: error.message } },
        { status: error.statusCode }
      );
    }
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to attach Knowledge Base' } },
      { status: 500 }
    );
  }
}
