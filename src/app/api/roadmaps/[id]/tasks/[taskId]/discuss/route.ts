import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { AppError, ValidationError, NotFoundError } from '@/errors';
import { roadmapRepository } from '@/features/roadmap/repository/roadmap.repository';
import { collaborationService } from '@/features/collaboration/collaboration.service';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: { id: string; taskId: string };
}

/**
 * Phase 7 — "discuss this item in collaboration." Deliberately the smallest useful integration:
 * shares a STRUCTURED REFERENCE (roadmap/task id + title) into a channel the user ALREADY
 * belongs to — never duplicates roadmap content into the message, never auto-creates a channel
 * (the caller must supply an existing channelId; channel membership itself is validated by the
 * existing, unmodified collaborationService.sendMessage()).
 *
 * This closes a real authorization gap the wider /api/collaboration/channels/[id]/messages route
 * does NOT close on its own (see this phase's audit): that generic endpoint accepts an arbitrary
 * sharedRoadmapId/sharedRoadmapStepId with zero ownership/access check. This DEDICATED endpoint
 * is the one place a roadmap task actually gets shared from the product's own UI, so it enforces
 * the missing check here — the caller must have at least VIEW access to the roadmap — without
 * touching the generic message-send path at all.
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
    const channelId = body.channelId;
    if (!channelId || typeof channelId !== 'string') {
      throw new ValidationError('channelId is required.');
    }

    // Avoid duplicate "task shared" messages — if this exact task has already been shared into
    // this exact channel, reuse the existing reference instead of posting another one. Membership
    // is checked here FIRST (mirroring sendMessage's own gate exactly) so this read-only pre-check
    // can never be used to peek at messages in a channel the caller doesn't belong to.
    const membership = await prisma.collabChannelMember.findUnique({
      where: { channelId_userId: { channelId, userId: user.id } }
    });
    if (!membership) {
      throw new Error('Access Denied: Not a member of this channel');
    }

    const existing = await prisma.collabMessage.findFirst({
      where: { channelId, sharedRoadmapId: params.id, sharedRoadmapStepId: task.id, isDeleted: false },
      orderBy: { createdAt: 'desc' }
    });
    if (existing) {
      return NextResponse.json({ success: true, data: existing });
    }

    const content = `📍 Roadmap task: "${task.title}" (from "${result.roadmap.title}")`;
    const message = await collaborationService.sendMessage(channelId, user.id, {
      content,
      sharedRoadmapId: params.id,
      sharedRoadmapStepId: task.id
    });

    return NextResponse.json({ success: true, data: message });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json({ success: false, error: { code: error.code, message: error.message } }, { status: error.statusCode });
    }
    const message = error instanceof Error ? error.message : String(error);
    const status = /Denied|Forbidden/i.test(message) ? 403 : 400;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
