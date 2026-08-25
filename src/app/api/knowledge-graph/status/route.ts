import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { knowledgeGraphService } from '@/features/knowledge-graph/knowledge-graph.service';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    const status = await knowledgeGraphService.getGraphStatus(user.id);

    return NextResponse.json({
      success: true,
      data: status
    });
  } catch (err: any) {
    console.error('GET /api/knowledge-graph/status error:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to retrieve Knowledge Graph status.' },
      { status: err.status || 500 }
    );
  }
}
