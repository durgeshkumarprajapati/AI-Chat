import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { scheduledMockTestService } from '@/features/study/scheduled-mock-test.service';

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    if (!body.title || !body.scheduledStartTime) {
      return NextResponse.json({ success: false, error: 'Title and scheduledStartTime are required' }, { status: 400 });
    }

    const mockTest = await scheduledMockTestService.scheduleMockTest(user.id, {
      title: body.title,
      description: body.description,
      topic: body.topic,
      documentId: body.documentId,
      knowledgeBaseId: body.knowledgeBaseId,
      scheduledStartTime: body.scheduledStartTime,
      durationMinutes: body.durationMinutes ? parseInt(body.durationMinutes, 10) : 30,
      totalQuestions: body.totalQuestions ? parseInt(body.totalQuestions, 10) : 10,
      passingScore: body.passingScore ? parseFloat(body.passingScore) : 70.0
    });

    return NextResponse.json({ success: true, data: mockTest }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to schedule mock test' },
      { status: 400 }
    );
  }
}
