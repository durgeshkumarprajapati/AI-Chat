import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { AppError } from '@/errors';
import { scheduledMessageService } from '@/features/collaboration/scheduled-message.service';

export const dynamic = 'force-dynamic';

/**
 * Edit (PATCH) and cancel (DELETE) a scheduled message. Ownership is enforced entirely inside
 * scheduledMessageService (a NotFoundError is thrown — not an AuthorizationError — for another
 * user's scheduled message, so its existence is never revealed to a non-owner).
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getAuthUser(req);
    const body = await req.json().catch(() => ({}));
    const { content, scheduledFor } = body;

    const updated = await scheduledMessageService.editScheduledMessage(params.id, user.id, { content, scheduledFor });
    return NextResponse.json({ success: true, data: updated });
  } catch (err) {
    const status = err instanceof AppError ? err.statusCode : 400;
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: message }, { status });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getAuthUser(req);
    const cancelled = await scheduledMessageService.cancelScheduledMessage(params.id, user.id);
    return NextResponse.json({ success: true, data: cancelled });
  } catch (err) {
    const status = err instanceof AppError ? err.statusCode : 400;
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
