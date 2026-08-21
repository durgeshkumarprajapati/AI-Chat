import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { voiceTutorService } from '@/features/voice-tutor/voice-tutor.service';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser(req);
    const { id: sessionId } = await context.params;
    const body = await req.json().catch(() => ({}));

    if (!body.text || typeof body.text !== 'string' || body.text.trim().length === 0) {
      return NextResponse.json({ success: false, error: 'Valid text input is required' }, { status: 400 });
    }

    const result = await voiceTutorService.processTurn({
      sessionId,
      userId: user.id,
      textInput: body.text.trim(),
      clientRequestId: body.clientRequestId
    });

    const audioBase64 = result.audioBuffer ? result.audioBuffer.toString('base64') : null;

    return NextResponse.json({
      success: true,
      data: {
        sessionId: result.sessionId,
        userMessage: result.userMessage,
        tutorMessage: result.tutorMessage,
        audioBase64,
        audioMimeType: result.audioMimeType || 'audio/mp3',
        ragContextUsed: result.ragContextUsed,
        graphContextUsed: result.graphContextUsed
      }
    });
  } catch (err: any) {
    const msg = err?.message || String(err);
    const status = err?.statusCode || (msg.includes('Unauthorized') ? 401 : msg.includes('not found') ? 404 : 400);
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}
