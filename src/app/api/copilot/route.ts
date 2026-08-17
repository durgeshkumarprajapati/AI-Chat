import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { copilotExecutionEngine } from '@/features/copilot/execution/copilot-execution.engine';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    const body = await req.json();

    if (!body.query || !body.query.trim()) {
      return NextResponse.json({ success: false, error: 'Query is required' }, { status: 400 });
    }

    const result = await copilotExecutionEngine.execute({
      userId: user.id,
      projectId: body.projectId,
      conversationId: body.conversationId,
      query: body.query,
      documentIds: body.documentIds,
      knowledgeBaseId: body.knowledgeBaseId,
      roadmapId: body.roadmapId,
      studySessionId: body.studySessionId,
      sourceMode: body.sourceMode,
      idempotencyKey: body.idempotencyKey
    });

    return NextResponse.json({ success: true, data: result }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to execute Copilot request' },
      { status: 500 }
    );
  }
}
