import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { studySessionService } from '@/features/study/service/study-session.service';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getAuthUser(req);
    const lesson = await studySessionService.generateTeachLesson(user.id, params.id);
    return NextResponse.json({ success: true, data: lesson });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
