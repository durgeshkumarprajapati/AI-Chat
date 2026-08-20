import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { CreateScheduledCallSchema } from '@/features/collaboration/scheduled-calls/scheduled-call.types';
import { scheduledCallService } from '@/features/collaboration/scheduled-calls/scheduled-call.service';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    const body = await req.json();

    const parsed = CreateScheduledCallSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid input', details: parsed.error.format() },
        { status: 400 }
      );
    }

    const scheduledCall = await scheduledCallService.createScheduledCall(user.id, parsed.data);
    return NextResponse.json({ success: true, data: scheduledCall }, { status: 201 });
  } catch (err: any) {
    const msg = err?.message || String(err);
    const status = msg.includes('Unauthorized') || msg.includes('Authentication') ? 401 : msg.includes('not found') || msg.includes('member') ? 403 : 400;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    // Fetch active calls across user's channels
    const userMemberships = await prisma.collabChannelMember.findMany({
      where: { userId: user.id },
      select: { channelId: true }
    });

    const channelIds = userMemberships.map((m) => m.channelId);
    const calls = await prisma.scheduledCall.findMany({
      where: {
        channelId: { in: channelIds },
        status: { in: ['SCHEDULED', 'LIVE'] }
      },
      include: {
        createdBy: { select: { id: true, name: true, email: true, avatarUrl: true } },
        participants: {
          include: {
            user: { select: { id: true, name: true, email: true, avatarUrl: true } }
          }
        }
      },
      orderBy: { scheduledStartAt: 'asc' }
    });

    const data = calls.map((c) => scheduledCallService.toDTO(c));
    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    const msg = err?.message || String(err);
    const status = msg.includes('Unauthorized') ? 401 : 400;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}
