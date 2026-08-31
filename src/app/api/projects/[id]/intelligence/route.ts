import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { projectAuthorizationService } from '@/features/projects/project-authorization.service';
import { prisma } from '@/lib/prisma';
import { projectIntelligenceOrchestrator } from '@/features/project-intelligence/project-intelligence.orchestrator';
import { AppError } from '@/errors';

export const dynamic = 'force-dynamic';

const PROJECT_INTELLIGENCE_INSIGHT_TYPES = ['PROJECT_RISK', 'BLOCKER', 'DEADLINE_RISK', 'TASK_MEETING_MISMATCH'] as const;

function errorResponse(error: unknown) {
  if (error instanceof AppError) {
    return NextResponse.json(
      { success: false, error: { code: error.code, message: error.message } },
      { status: error.statusCode }
    );
  }
  return NextResponse.json(
    { success: false, error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to process project intelligence request' } },
    { status: 500 }
  );
}

// GET reads already-persisted insights only — it deliberately never triggers a fresh analysis
// pass, so this route can never turn into a "full scan on every page load".
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const authUser = await getAuthUser(req);
    await projectAuthorizationService.authorizeProjectAccess(authUser.id, params.id, 'VIEW_PROJECT');

    const insights = await prisma.intelligenceInsight.findMany({
      where: { projectId: params.id, type: { in: [...PROJECT_INTELLIGENCE_INSIGHT_TYPES] } },
      include: { evidence: true },
      orderBy: { createdAt: 'desc' },
      take: 100
    });

    return NextResponse.json({ success: true, data: insights });
  } catch (error) {
    return errorResponse(error);
  }
}

// POST triggers an on-demand refresh. This is a heavier action than a passive read (it may call
// out to ClickUp/Calendar and writes new insight rows), so it requires EDIT_PROJECT-or-above
// rather than the read-only VIEW_PROJECT bar used by GET.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const authUser = await getAuthUser(req);
    await projectAuthorizationService.authorizeProjectAccess(authUser.id, params.id, 'EDIT_PROJECT');

    const result = await projectIntelligenceOrchestrator.runAnalysisForProject(authUser.id, params.id);
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    return errorResponse(error);
  }
}
