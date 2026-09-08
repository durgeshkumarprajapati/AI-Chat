import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { projectRoadmapLinkService } from '@/features/projects/roadmap-links/project-roadmap-link.service';
import { AppError, ValidationError } from '@/errors';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: { id: string };
}

/**
 * Project Roadmap Linking & Governance. GET lists every roadmap linked to this project that the
 * REQUESTING user can independently access (roadmap access is re-checked per link — a linked
 * roadmap the user cannot access is silently excluded, never named). POST either links an
 * existing, already-authorized roadmap (`{ roadmapId }`) or generates a brand-new one via the
 * existing roadmap generation engine and links it (`{ create: <questionnaire answers> }`) —
 * never both in one request.
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const user = await getAuthUser(req);
    const result = await projectRoadmapLinkService.listLinks(user.id, params.id);
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json({ success: false, error: { code: error.code, message: error.message } }, { status: error.statusCode });
    }
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to list project roadmap links.' } },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const user = await getAuthUser(req);
    const body = await req.json().catch(() => ({}));

    if (body.roadmapId && body.create) {
      throw new ValidationError('Provide either roadmapId (link existing) or create (generate new), not both.');
    }

    if (body.roadmapId) {
      if (typeof body.roadmapId !== 'string') {
        throw new ValidationError('roadmapId must be a string.');
      }
      await projectRoadmapLinkService.createLink(user.id, params.id, body.roadmapId);
      return NextResponse.json({ success: true, data: { roadmapId: body.roadmapId } }, { status: 201 });
    }

    if (body.create) {
      const roadmap = await projectRoadmapLinkService.createRoadmapAndLink(user.id, params.id, body.create);
      return NextResponse.json({ success: true, data: roadmap }, { status: 201 });
    }

    throw new ValidationError('Provide either roadmapId (link existing) or create (generate new).');
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json({ success: false, error: { code: error.code, message: error.message } }, { status: error.statusCode });
    }
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to link roadmap to project.' } },
      { status: 500 }
    );
  }
}
