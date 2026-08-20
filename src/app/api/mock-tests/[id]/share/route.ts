import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { collaborationService } from '@/features/collaboration/collaboration.service';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { id: mockTestId } = await params;
    const body = await req.json();
    const { channelId, targetUserId, message } = body;

    const mockTest = await prisma.scheduledMockTest.findUnique({
      where: { id: mockTestId }
    });

    if (!mockTest) {
      return NextResponse.json({ success: false, error: 'Mock test not found' }, { status: 404 });
    }

    let activeChannelId = channelId;

    if (!activeChannelId && targetUserId) {
      const dmChannel = await collaborationService.getOrCreateDirectChannel(user.id, targetUserId);
      activeChannelId = dmChannel.id;
    }

    if (!activeChannelId) {
      return NextResponse.json(
        { success: false, error: 'channelId or targetUserId must be provided for sharing' },
        { status: 400 }
      );
    }

    const contentText = message?.trim() || `📝 Shared AI Mock Test: ${mockTest.title}`;

    const sentMessage = await collaborationService.sendMessage(activeChannelId, user.id, {
      content: contentText,
      sharedMockTestId: mockTest.id
    });

    return NextResponse.json({ success: true, data: sentMessage }, { status: 200 });
  } catch (err: any) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 400 });
  }
}
