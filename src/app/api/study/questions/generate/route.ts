import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { studyQuestionGeneratorService } from '@/features/study';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    const body = await req.json();
    if (!body.topicTitle) {
      return NextResponse.json({ success: false, error: 'Missing topicTitle' }, { status: 400 });
    }

    const payload = await studyQuestionGeneratorService.generateQuestion(
      user.id,
      body.sessionId || 'session-gen',
      {
        topicId: body.topicId || 'topic-gen',
        topicTitle: body.topicTitle,
        topicDescription: body.topicDescription || body.topicTitle,
        questionType: body.questionType || 'MCQ',
        difficulty: body.difficulty || 'BEGINNER',
        knowledgeBaseId: body.knowledgeBaseId,
        documentIds: body.documentIds,
        externalWebEnabled: !!body.externalWebEnabled
      }
    );

    if ('error' in payload) {
      return NextResponse.json({ success: false, error: payload.error }, { status: 422 });
    }

    return NextResponse.json({ success: true, data: payload });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
