import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { AppError, ValidationError, NotFoundError } from '@/errors';
import { roadmapRepository } from '@/features/roadmap/repository/roadmap.repository';
import { scheduledMessageService } from '@/features/collaboration/scheduled-message.service';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: { id: string; taskId: string };
}

/**
 * Scheduled Collaboration Messages integration — reuses the EXISTING ScheduledMessage table,
 * delivery processor, and canonical sendMessage pipeline completely unmodified. No new scheduling
 * model, no new schema. The task reference is embedded as plain text in the message content at
 * creation time (the SAME "structured reference in the content string" pattern already used by
 * the discuss endpoint) — ScheduledMessage has no metadata/reference column to (mis)use instead,
 * and adding one would duplicate what the content string can already safely express.
 *
 * Both roadmap access (findRoadmapByIdForUser, mirrors the discuss endpoint's VIEW-or-above bar)
 * and channel membership (enforced by scheduledMessageService.createScheduledMessage itself) are
 * validated before any row is created — a scheduled message is delivered exactly like a normal
 * chat message the sender posts, visible to the channel's own existing members, never exposing
 * roadmap data beyond what the sender themselves chooses to write.
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const user = await getAuthUser(req);
    const result = await roadmapRepository.findRoadmapByIdForUser(params.id, user.id);
    if (!result) {
      throw new NotFoundError('Roadmap');
    }

    const task = result.roadmap.phases.flatMap((p) => p.tasks).find((t) => t.id === params.taskId);
    if (!task) {
      throw new NotFoundError('Task');
    }

    const body = await req.json().catch(() => ({}));
    const { channelId, message, scheduledFor, timezone } = body;

    if (!channelId || typeof channelId !== 'string') {
      throw new ValidationError('channelId is required.');
    }
    if (!message || typeof message !== 'string' || !message.trim()) {
      throw new ValidationError('message cannot be empty.');
    }
    if (!scheduledFor || typeof scheduledFor !== 'string') {
      throw new ValidationError('scheduledFor is required.');
    }

    const content = `📍 Re: "${task.title}" (from "${result.roadmap.title}")\n\n${message.trim()}`;

    const scheduledMessage = await scheduledMessageService.createScheduledMessage(channelId, user.id, {
      content,
      scheduledFor,
      timezone
    });

    return NextResponse.json({ success: true, data: scheduledMessage });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json({ success: false, error: { code: error.code, message: error.message } }, { status: error.statusCode });
    }
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to schedule message.' } },
      { status: 500 }
    );
  }
}
