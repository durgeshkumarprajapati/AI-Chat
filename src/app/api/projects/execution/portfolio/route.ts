import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { portfolioExecutionService } from '@/features/projects/execution/portfolio-execution.service';
import { AppError } from '@/errors';

export const dynamic = 'force-dynamic';

/**
 * GET /api/projects/execution/portfolio — lightweight, deterministic portfolio-level execution
 * visibility across every project the requesting user can access. Composes the EXISTING
 * per-project Project Execution Command Center summary (one call per accessible project) rather
 * than recomputing any roadmap/task health logic. No LLM call, no numerical health score, no task
 * descriptions or document content — only status/progress/counts and already-explainable
 * cross-project priority reasons.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    const summary = await portfolioExecutionService.getPortfolioExecutionSummary(user.id);
    return NextResponse.json({ success: true, data: summary });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json({ success: false, error: { code: error.code, message: error.message } }, { status: error.statusCode });
    }
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to compute portfolio execution summary.' } },
      { status: 500 }
    );
  }
}
