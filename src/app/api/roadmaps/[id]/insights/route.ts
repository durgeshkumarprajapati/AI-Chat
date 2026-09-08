import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { roadmapRepository } from '@/features/roadmap/repository/roadmap.repository';
import { AppError, NotFoundError } from '@/errors';
import { computeRoadmapInsights } from '@/features/roadmap/execution/roadmap-insights';
import { loadRoadmapReminderConfig } from '@/features/roadmap/execution/roadmap-reminder-config';
import { loadRoadmapBottleneckConfig } from '@/features/roadmap/execution/roadmap-bottleneck-config';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: { id: string };
}

/**
 * Roadmap Analytics, Insights & Execution Dashboard pass — exactly two DB round trips, mirroring
 * the existing GET /api/roadmaps/[id] route's own loading pattern: the already-authorized roadmap
 * (findRoadmapByIdForUser — owner or active share recipient only, same gate every other roadmap
 * route uses) and its dependency edges (listDependencyEdgesForRoadmap, bounded to this roadmap).
 * Everything else — overview counts, execution health, next step, bottlenecks, workload,
 * dependency impact, phase analytics, trends — is computed in computeRoadmapInsights, a pure
 * function reusing every existing execution primitive. Activity is deliberately NOT included here
 * (the existing GET .../activity endpoint already serves it on demand, per the "load activity
 * only when required" requirement).
 *
 * No new authorization system: a VIEW-permission share recipient can read this exactly as they
 * can already read task/assignee details on the main GET route — there is no narrower tier to
 * enforce beyond "has roadmap access," so reusing findRoadmapByIdForUser is both correct and
 * sufficient. No user/task ID is ever accepted from the request — this endpoint can only ever
 * return data for the one, already-authorized roadmap in the URL.
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const user = await getAuthUser(req);
    const result = await roadmapRepository.findRoadmapByIdForUser(params.id, user.id);

    if (!result) {
      throw new NotFoundError('Roadmap');
    }

    const [dependencyEdges, reminderConfig, bottleneckConfig] = await Promise.all([
      roadmapRepository.listDependencyEdgesForRoadmap(params.id),
      loadRoadmapReminderConfig(),
      loadRoadmapBottleneckConfig()
    ]);

    const insights = computeRoadmapInsights(result.roadmap.phases, dependencyEdges, reminderConfig, bottleneckConfig);

    return NextResponse.json({ success: true, data: insights });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json({ success: false, error: { code: error.code, message: error.message } }, { status: error.statusCode });
    }
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to compute roadmap insights.' } },
      { status: 500 }
    );
  }
}
