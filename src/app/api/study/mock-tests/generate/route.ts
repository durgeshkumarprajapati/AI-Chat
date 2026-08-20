import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { mockTestGeneratorService } from '@/features/study/mock-test-generator.service';

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const questions = await mockTestGeneratorService.generateMCQQuestions({
      topic: body.topic,
      documentId: body.documentId,
      knowledgeBaseId: body.knowledgeBaseId,
      contentContext: body.contentContext,
      questionCount: body.questionCount ? parseInt(body.questionCount, 10) : 10
    });

    return NextResponse.json({ success: true, data: questions }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to generate mock test questions' },
      { status: 400 }
    );
  }
}
