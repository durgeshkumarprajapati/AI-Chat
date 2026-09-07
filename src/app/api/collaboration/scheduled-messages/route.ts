import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { AppError } from '@/errors';
import { ScheduledMessageStatus } from '@prisma/client';
import { scheduledMessageService } from '@/features/collaboration/scheduled-message.service';

export const dynamic = 'force-dynamic';

const VALID_STATUSES: ScheduledMessageStatus[] = ['PENDING', 'PROCESSING', 'SENT', 'FAILED', 'CANCELLED'];

/**
 * Scheduled Messaging — mirrors the existing collaboration API family's exact conventions
 * (getAuthUser, `{success, error}` envelope, statusCode-from-AppError-else-400). Listing is
 * always scoped to the caller's own scheduled messages — there is no way to pass another user's
 * id, so this route structurally cannot leak another user's scheduled message.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    const { searchParams } = new URL(req.url);
    const channelId = searchParams.get('channelId') || undefined;
    const statusParam = searchParams.get('status');
    const status = statusParam && VALID_STATUSES.includes(statusParam as ScheduledMessageStatus) ? (statusParam as ScheduledMessageStatus) : undefined;
    const limitParam = searchParams.get('limit');
    const limit = limitParam ? Number(limitParam) : undefined;

    const messages = await scheduledMessageService.listScheduledMessages(user.id, { channelId, status, limit });
    return NextResponse.json({ success: true, data: messages });
  } catch (err) {
    const status = err instanceof AppError ? err.statusCode : 400;
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: message }, { status });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    const body = await req.json().catch(() => ({}));
    const { channelId, content, scheduledFor, timezone } = body;

    if (!channelId || typeof channelId !== 'string') {
      return NextResponse.json({ success: false, error: 'channelId is required' }, { status: 400 });
    }
    if (!scheduledFor || typeof scheduledFor !== 'string') {
      return NextResponse.json({ success: false, error: 'scheduledFor is required' }, { status: 400 });
    }
    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return NextResponse.json({ success: false, error: 'Message content cannot be empty' }, { status: 400 });
    }

    const scheduledMessage = await scheduledMessageService.createScheduledMessage(channelId, user.id, {
      content, scheduledFor, timezone
    });

    return NextResponse.json({ success: true, data: scheduledMessage });
  } catch (err) {
    const status = err instanceof AppError ? err.statusCode : 400;
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
