import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { roadmapRepository } from '@/features/roadmap/repository/roadmap.repository';
import { toRoadmapActivityEntries } from '@/features/roadmap/execution/roadmap-activity';
import { AppError, NotFoundError } from '@/errors';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: { id: string };
}

/**
 * Activity Timeline pass — derives the roadmap's execution activity feed from the EXISTING
 * AuditLog (no new table). Authorization is identical to every other roadmap read: owner or
 * active share recipient only, via findRoadmapByIdForUser. The actual safe-projection logic
 * (which fields are ever exposed) lives in toRoadmapActivityEntries, not here.
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const user = await getAuthUser(req);
    const result = await roadmapRepository.findRoadmapByIdForUser(params.id, user.id);
    if (!result) {
      throw new NotFoundError('Roadmap');
    }

    const { searchParams } = new URL(req.url);
    const limitParam = Number(searchParams.get('limit'));
    const limit = Number.isFinite(limitParam) && limitParam > 0 ? limitParam : 50;

    const logs = await roadmapRepository.listActivityForRoadmap(params.id, limit);
    const activity = toRoadmapActivityEntries(logs);

    return NextResponse.json({ success: true, data: activity });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json({ success: false, error: { code: error.code, message: error.message } }, { status: error.statusCode });
    }
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch roadmap activity.' } },
      { status: 500 }
    );
  }
}
