import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { projectAuthorizationService } from '@/features/projects/project-authorization.service';
import { aiIntelligenceService } from '@/features/ai-intelligence/services/ai-intelligence.service';
import { AppError } from '@/errors';

export const dynamic = 'force-dynamic';

function errorResponse(error: unknown) {
  if (error instanceof AppError) {
    return NextResponse.json(
      { success: false, error: { code: error.code, message: error.message } },
      { status: error.statusCode }
    );
  }
  return NextResponse.json(
    { success: false, error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to process AI Workspace Intelligence request' } },
    { status: 500 }
  );
}

// Lightweight combined overview: latest daily + latest weekly snapshot (never triggers
// generation — both reads go through aiIntelligenceService.getSnapshot's cache-first, indexed-DB
// fast path). This is deliberately separate from /api/intelligence/insights (Phase 78's existing
// insight list/refresh route) — different path, different purpose.
export async function GET(req: NextRequest) {
  try {
    const authUser = await getAuthUser(req);
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get('projectId') || null;

    if (projectId) {
      await projectAuthorizationService.authorizeProjectAccess(authUser.id, projectId, 'VIEW_PROJECT');
    }

    const [daily, weekly] = await Promise.all([
      aiIntelligenceService.getSnapshot(authUser.id, 'DAILY', projectId),
      aiIntelligenceService.getSnapshot(authUser.id, 'WEEKLY', projectId)
    ]);

    return NextResponse.json({
      success: true,
      data: {
        daily,
        weekly,
        hasDaily: Boolean(daily),
        hasWeekly: Boolean(weekly)
      }
    });
  } catch (error) {
    return errorResponse(error);
  }
}
