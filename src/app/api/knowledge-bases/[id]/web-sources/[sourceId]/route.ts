import { NextRequest, NextResponse } from 'next/server';
import { knowledgeBaseService } from '@/features/knowledge-bases/services/knowledge-base.service';
import { AppError } from '@/errors';

const DEFAULT_USER_ID = '00000000-0000-0000-0000-000000000000';

function getUserId(req: NextRequest): string {
  return req.headers.get('x-user-id') || DEFAULT_USER_ID;
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string; sourceId: string } }) {
  try {
    const userId = getUserId(req);
    await knowledgeBaseService.removeDocumentFromKnowledgeBase(userId, params.id, params.sourceId);
    return NextResponse.json({ success: true, message: 'Web source removed from Knowledge Base' });
  } catch (err) {
    if (err instanceof AppError) {
      return NextResponse.json(
        { success: false, error: { message: err.message, code: err.code } },
        { status: err.statusCode }
      );
    }
    return NextResponse.json(
      { success: false, error: { message: 'Failed to remove web source from Knowledge Base' } },
      { status: 500 }
    );
  }
}
