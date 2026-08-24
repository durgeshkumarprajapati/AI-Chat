import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { voiceMessageStorageService } from '@/features/collaboration/voice-storage.service';
import fs from 'fs';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: { messageId: string } }) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const message = await prisma.collabMessage.findUnique({
      where: { id: params.messageId },
      include: {
        channel: {
          include: {
            members: { select: { userId: true } }
          }
        }
      }
    });

    if (!message || message.messageType !== 'VOICE' || !message.voiceStorageKey) {
      return NextResponse.json({ success: false, error: 'Voice message not found' }, { status: 404 });
    }

    // Security Guard: Check user channel membership
    const isMember = message.channel.members.some((m) => m.userId === user.id);
    if (!isMember) {
      return NextResponse.json({ success: false, error: 'Access Denied: Not a member of this channel' }, { status: 403 });
    }

    const filePath = voiceMessageStorageService.getVoiceFilePath(message.voiceStorageKey);
    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ success: false, error: 'Voice audio file missing on storage' }, { status: 404 });
    }

    const stat = fs.statSync(filePath);
    const mimeType = message.voiceMimeType || 'audio/webm';
    const stream = fs.createReadStream(filePath);

    return new NextResponse(stream as any, {
      status: 200,
      headers: {
        'Content-Type': mimeType,
        'Content-Length': stat.size.toString(),
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'private, max-age=3600'
      }
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to retrieve voice message' },
      { status: 500 }
    );
  }
}
