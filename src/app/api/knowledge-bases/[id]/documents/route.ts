import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { knowledgeBaseService } from '@/features/knowledge-bases/services/knowledge-base.service';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthUser(req);
    const documents = await knowledgeBaseService.listKnowledgeBaseDocuments(user.id, params.id);

    return NextResponse.json({
      success: true,
      data: documents
    });
  } catch (error) {
    const statusCode = (error as { statusCode?: number }).statusCode || 500;
    const message = (error as Error).message || 'Internal Server Error';
    return NextResponse.json({ success: false, error: { message } }, { status: statusCode });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthUser(req);
    const body = await req.json();

    if (!body.documentId) {
      return NextResponse.json({
        success: false,
        error: { message: 'documentId is required' }
      }, { status: 400 });
    }

    await knowledgeBaseService.addDocumentToKnowledgeBase(user.id, params.id, body.documentId);

    return NextResponse.json({
      success: true,
      message: 'Document added to Knowledge Base successfully'
    }, { status: 201 });
  } catch (error) {
    const statusCode = (error as { statusCode?: number }).statusCode || 500;
    const message = (error as Error).message || 'Internal Server Error';
    return NextResponse.json({ success: false, error: { message } }, { status: statusCode });
  }
}
