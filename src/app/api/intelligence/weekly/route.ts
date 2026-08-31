import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { projectAuthorizationService } from '@/features/projects/project-authorization.service';
import { aiIntelligenceService } from '@/features/ai-intelligence/services/ai-intelligence.service';
import { aiIntelligenceRateLimitService } from '@/features/ai-intelligence/security/ai-intelligence-rate-limit.service';
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
    { success: false, error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to process weekly AI briefing request' } },
    { status: 500 }
  );
}

// GET reads the latest already-generated READY weekly snapshot only — it NEVER triggers a fresh
// generation pass.
export async function GET(req: NextRequest) {
  try {
    const authUser = await getAuthUser(req);
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get('projectId') || null;

    if (projectId) {
      await projectAuthorizationService.authorizeProjectAccess(authUser.id, projectId, 'VIEW_PROJECT');
    }

    const snapshot = await aiIntelligenceService.getSnapshot(authUser.id, 'WEEKLY', projectId);
    return NextResponse.json({ success: true, data: snapshot });
  } catch (error) {
    return errorResponse(error);
  }
}

// POST is the on-demand manual trigger — heavier (aggregation + possible LLM call), so it is
// rate-limited per user.
export async function POST(req: NextRequest) {
  try {
    const authUser = await getAuthUser(req);
    const body = await req.json().catch(() => ({}));
    const projectId = typeof body?.projectId === 'string' ? body.projectId : null;
    const force = body?.force === true;

    if (projectId) {
      await projectAuthorizationService.authorizeProjectAccess(authUser.id, projectId, 'VIEW_PROJECT');
    }

    const allowed = await aiIntelligenceRateLimitService.checkRateLimit(authUser.id, ':weekly');
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: { code: 'RATE_LIMITED', message: 'Too many weekly briefing requests. Please try again shortly.' } },
        { status: 429 }
      );
    }

    const snapshot = await aiIntelligenceService.generateSnapshot(authUser.id, 'WEEKLY', projectId, { force });
    return NextResponse.json({ success: true, data: snapshot });
  } catch (error) {
    return errorResponse(error);
  }
}
