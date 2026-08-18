import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { knowledgeGraphService } from '@/features/knowledge-graph/knowledge-graph.service';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    const { searchParams } = new URL(req.url);

    const projectId = searchParams.get('projectId');
    const depth = searchParams.get('depth') ? parseInt(searchParams.get('depth')!, 10) : 2;
    const searchQuery = searchParams.get('q') || undefined;

    const graph = await knowledgeGraphService.getGraph({
      userId: user.id,
      projectId,
      depth,
      searchQuery
    });

    return NextResponse.json({
      success: true,
      data: graph
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to retrieve Knowledge Graph.' },
      { status: err.status || 500 }
    );
  }
}
