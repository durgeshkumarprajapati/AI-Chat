import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { studySessionService } from '@/features/study';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthUser(req);
    const session = await studySessionService.getSessionDetails(user.id, params.id);
    return NextResponse.json({
      success: true,
      data: {
        sessionId: session.id,
        progressPercent: session.progressPercent,
        status: session.status,
        currentMode: session.currentMode,
        topics: session.topics.map((t: any) => ({
          id: t.id,
          title: t.title,
          masteryScore: t.masteryScore,
          questionCount: t.questions.length
        }))
      }
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
