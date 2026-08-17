import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { studySessionService } from '@/features/study/service/study-session.service';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getAuthUser(req);
    const body = await req.json();

    if (!body.exerciseId || !body.solution) {
      return NextResponse.json({ success: false, error: 'exerciseId and solution are required' }, { status: 400 });
    }

    const evalResult = await studySessionService.evaluatePractice(user.id, params.id, body.exerciseId, body.solution);
    return NextResponse.json({ success: true, data: evalResult });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
