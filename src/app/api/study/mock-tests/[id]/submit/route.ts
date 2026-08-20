import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { scheduledMockTestService } from '@/features/study/scheduled-mock-test.service';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    if (!body.answers || !Array.isArray(body.answers)) {
      return NextResponse.json({ success: false, error: 'Answers array is required' }, { status: 400 });
    }

    const result = await scheduledMockTestService.submitMockTestAnswers(params.id, user.id, {
      answers: body.answers
    });

    return NextResponse.json({ success: true, data: result }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to submit mock test answers' },
      { status: 400 }
    );
  }
}
