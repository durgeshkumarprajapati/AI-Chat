import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { voiceTutorSessionService } from '@/features/voice-tutor/voice-tutor.session.service';
import { voiceTutorFeedbackService } from '@/features/voice-tutor/voice-tutor.feedback.service';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser(req);
    const { id: sessionId } = await context.params;

    const session = await voiceTutorSessionService.completeSession(sessionId, user.id);
    const feedback = await voiceTutorFeedbackService.generateFeedback(sessionId, user.id);

    return NextResponse.json({
      success: true,
      data: {
        session,
        feedback
      }
    });
  } catch (err: any) {
    const msg = err?.message || String(err);
    const status = msg.includes('Unauthorized') ? 401 : msg.includes('not found') ? 404 : 400;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}
