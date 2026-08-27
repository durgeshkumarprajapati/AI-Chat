import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { projectRagService } from '@/features/projects/project-rag.service';
import { AppError } from '@/errors';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string; conversationId: string } }
) {
  try {
    const authUser = await getAuthUser(req);
    const result = await projectRagService.getMessages(
      authUser.id,
      params.id,
      params.conversationId
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
      { success: false, error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to fetch project messages' } },
      { status: 500 }
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string; conversationId: string } }
) {
  try {
    const authUser = await getAuthUser(req);
    const body = await req.json();
    const result = await projectRagService.sendMessage(
      authUser.id,
      params.id,
      params.conversationId,
      body.content
    );
    return NextResponse.json({ success: true, data: result }, { status: 201 });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(
        { success: false, error: { code: error.code, message: error.message } },
        { status: error.statusCode }
      );
    }
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to send project message' } },
      { status: 500 }
    );
  }
}
