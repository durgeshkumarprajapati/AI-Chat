import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { studySessionService } from '@/features/study/service/study-session.service';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getAuthUser(req);
    const body = await req.json();

    if (!body.topicId || !body.response) {
      return NextResponse.json({ success: false, error: 'topicId and response are required' }, { status: 400 });
    }

    const stepResult = await studySessionService.socraticStep(user.id, params.id, body.topicId, body.response);
    return NextResponse.json({ success: true, data: stepResult });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
