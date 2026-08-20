import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { collaborationService } from '@/features/collaboration/collaboration.service';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const channelId = params.id;
    const formData = await req.formData();
    const file = formData.get('audio') as File | null;
    const durationMsStr = formData.get('durationMs') as string | null;
    const clientMessageId = (formData.get('clientMessageId') as string | null) || undefined;

    if (!file) {
      return NextResponse.json({ success: false, error: 'Audio file is required' }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const mimeType = file.type || 'audio/webm';
    const durationMs = durationMsStr ? parseInt(durationMsStr, 10) : undefined;

    const message = await collaborationService.sendVoiceMessage(
      channelId,
      user.id,
      buffer,
      mimeType,
      durationMs,
      clientMessageId
    );

    return NextResponse.json({ success: true, data: message }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to send voice message' },
      { status: err.message?.includes('Access Denied') ? 403 : 400 }
    );
  }
}
