import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { voiceTutorService } from '@/features/voice-tutor/voice-tutor.service';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser(req);
    const { id: sessionId } = await context.params;

    let audioBuffer: Buffer | undefined = undefined;
    let mimeType = 'audio/webm';
    let clientRequestId: string | undefined = undefined;

    const contentType = req.headers.get('content-type') || '';

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const file = formData.get('file') as File | null;
      clientRequestId = (formData.get('clientRequestId') as string) || undefined;

      if (!file) {
        return NextResponse.json({ success: false, error: 'No audio file found in form data' }, { status: 400 });
      }

      mimeType = file.type || 'audio/webm';
      const arrayBuffer = await file.arrayBuffer();
      audioBuffer = Buffer.from(arrayBuffer);
    } else {
      const body = await req.json().catch(() => ({}));
      clientRequestId = body.clientRequestId;
      if (body.audioBase64) {
        mimeType = body.mimeType || 'audio/webm';
        audioBuffer = Buffer.from(body.audioBase64, 'base64');
      }
    }

    if (!audioBuffer || audioBuffer.length === 0) {
      return NextResponse.json({ success: false, error: 'Empty audio buffer provided' }, { status: 400 });
    }

    const result = await voiceTutorService.processTurn({
      sessionId,
      userId: user.id,
      audioBuffer,
      audioMimeType: mimeType,
      clientRequestId
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
