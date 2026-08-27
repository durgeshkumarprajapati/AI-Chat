import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { projectRagService } from '@/features/projects/project-rag.service';
import { AppError } from '@/errors';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string; conversationId: string } }
) {
  try {
    const authUser = await getAuthUser(req);
    const body = await req.json();
    const result = await projectRagService.askAI(
      authUser.id,
      params.id,
      params.conversationId,
      body.question,
      { model: body.model }
    );
    return NextResponse.json({ success: true, data: result }, { status: 200 });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(
        { success: false, error: { code: error.code, message: error.message } },
        { status: error.statusCode }
      );
    }
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to process AI question' } },
      { status: 500 }
    );
  }
}
