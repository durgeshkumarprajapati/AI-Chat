import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { projectRoadmapLinkService } from '@/features/projects/roadmap-links/project-roadmap-link.service';
import { AppError, ValidationError } from '@/errors';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: { id: string; roadmapId: string };
}

/**
 * PATCH sets this roadmap as the project's primary roadmap (the only supported link-metadata
 * update — see project-roadmap-link.service.ts for why no other metadata field was added). DELETE
 * unlinks it — an organizational-only removal that never touches the roadmap, its tasks,
 * discussions, scheduled messages, or audit history.
 */
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const user = await getAuthUser(req);
    const body = await req.json().catch(() => ({}));

    if (body.isPrimary !== true) {
      throw new ValidationError('Only { isPrimary: true } is supported for this link.');
    }

    await projectRoadmapLinkService.setPrimaryRoadmap(user.id, params.id, params.roadmapId);
    return NextResponse.json({ success: true, data: { roadmapId: params.roadmapId, isPrimary: true } });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json({ success: false, error: { code: error.code, message: error.message } }, { status: error.statusCode });
    }
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to update project roadmap link.' } },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  try {
    const user = await getAuthUser(req);
    await projectRoadmapLinkService.unlink(user.id, params.id, params.roadmapId);
    return NextResponse.json({ success: true, data: { roadmapId: params.roadmapId } });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json({ success: false, error: { code: error.code, message: error.message } }, { status: error.statusCode });
    }
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to unlink roadmap from project.' } },
      { status: 500 }
    );
  }
}
