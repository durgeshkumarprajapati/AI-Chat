import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { projectExecutionService } from '@/features/projects/execution/project-execution.service';
import { AppError } from '@/errors';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: { id: string };
}

/**
 * GET /api/projects/[id]/execution — Project Execution Command Center. One additive endpoint
 * (Section 10) rather than the frontend issuing GET project + GET roadmap-1 + GET roadmap-2 + ...:
 * authorization, bounded roadmap resolution, bounded data loading, and pure in-memory aggregation
 * all happen server-side in projectExecutionService, and the client makes exactly one request.
 *
 * Deliberately a SEPARATE endpoint from GET /api/projects/[id] rather than folded into it: the
 * project detail endpoint is read on every project page load and is cheap (shallow linked-resource
 * summaries only), while this endpoint fans out to every linked roadmap's full execution insights
 * — a materially different cost profile that a project page section can choose to fetch lazily
 * (e.g. only when the Command Center section is visible) without slowing down the base page.
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const user = await getAuthUser(req);
    const summary = await projectExecutionService.getProjectExecutionSummary(user.id, params.id);
    return NextResponse.json({ success: true, data: summary });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json({ success: false, error: { code: error.code, message: error.message } }, { status: error.statusCode });
    }
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to compute project execution summary.' } },
      { status: 500 }
    );
  }
}
