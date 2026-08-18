import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { knowledgeReasoningService } from '@/features/knowledge-graph/reasoning/knowledge-reasoning.service';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    const body = await req.json();
    const { sourceEntityId, targetEntityId, projectId } = body;

    if (!sourceEntityId || !targetEntityId) {
      return NextResponse.json(
        { success: false, error: 'sourceEntityId and targetEntityId are required.' },
        { status: 400 }
      );
    }

    const explanation = await knowledgeReasoningService.explainConnection(
      user.id,
      sourceEntityId,
      targetEntityId,
      projectId
    );

    return NextResponse.json({
      success: true,
      data: explanation
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to explain connection.' },
      { status: err.status || 500 }
    );
  }
}
