import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { scheduledMockTestService } from '@/features/study/scheduled-mock-test.service';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const sessionData = await scheduledMockTestService.startMockTestSession(params.id, user.id);
    return NextResponse.json({ success: true, data: sessionData }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to start mock test session' },
      { status: 400 }
    );
  }
}
