import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { knowledgeGraphService } from '@/features/knowledge-graph/knowledge-graph.service';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    const body = await req.json();
    const { documentId, projectId } = body;

    if (!documentId) {
      return NextResponse.json({ success: false, error: 'documentId is required.' }, { status: 400 });
    }

    const stats = await knowledgeGraphService.indexDocument(documentId, user.id, projectId);

    return NextResponse.json({
      success: true,
      data: stats
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to index document graph.' },
      { status: err.status || 500 }
    );
  }
}
