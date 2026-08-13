import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { knowledgeBaseService } from '@/features/knowledge-bases/services/knowledge-base.service';

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string; documentId: string } }
) {
  try {
    const user = await getAuthUser(req);
    await knowledgeBaseService.removeDocumentFromKnowledgeBase(user.id, params.id, params.documentId);

    return NextResponse.json({
      success: true,
      message: 'Document removed from Knowledge Base'
    });
  } catch (error) {
    const statusCode = (error as { statusCode?: number }).statusCode || 500;
    const message = (error as Error).message || 'Internal Server Error';
    return NextResponse.json({ success: false, error: { message } }, { status: statusCode });
  }
}
