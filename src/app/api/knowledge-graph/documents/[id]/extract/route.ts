import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { knowledgeGraphService } from '@/features/knowledge-graph/knowledge-graph.service';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthUser(req);
    const documentId = params.id;

    const job = await knowledgeGraphService.triggerDocumentExtraction(documentId, user.id);

    return NextResponse.json({
      success: true,
      message: `Knowledge Graph extraction job queued for document ${documentId}.`,
      data: job
    });
  } catch (err: any) {
    console.error(`POST /api/knowledge-graph/documents/${params.id}/extract error:`, err);
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to trigger document graph extraction.' },
      { status: err.status || 500 }
    );
  }
}
