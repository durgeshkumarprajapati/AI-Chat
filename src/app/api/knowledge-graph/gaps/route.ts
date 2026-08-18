import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { knowledgeGapService } from '@/features/knowledge-graph/reasoning/knowledge-gap.service';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get('projectId');

    const gaps = await knowledgeGapService.detectKnowledgeGaps(user.id, projectId);

    return NextResponse.json({
      success: true,
      data: gaps
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to detect knowledge gaps.' },
      { status: err.status || 500 }
    );
  }
}
