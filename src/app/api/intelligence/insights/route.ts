import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser } from '@/lib/auth';
import { projectAuthorizationService } from '@/features/projects/project-authorization.service';
import { insightRepository } from '@/features/knowledge-intelligence/insight.repository';
import { knowledgeIntelligenceOrchestrator } from '@/features/knowledge-intelligence/knowledge-intelligence.orchestrator';
import { InsightStatus, IntelligenceInsightType } from '@prisma/client';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(req);
    const { searchParams } = new URL(req.url);
    const status = (searchParams.get('status') as InsightStatus | null) ?? undefined;
    const type = (searchParams.get('type') as IntelligenceInsightType | null) ?? undefined;
    const projectId = searchParams.get('projectId') ?? undefined;

    if (projectId) {
      // Never trust the client's own userId — project access is checked for the authenticated user.
      await projectAuthorizationService.authorizeProjectAccess(user.id, projectId, 'VIEW_PROJECT');
      const insights = await insightRepository.listInsightsForProject(projectId, { status, type });
      return NextResponse.json({ success: true, data: insights });
    }

    const insights = await insightRepository.listInsights(user.id, { status, type });
    return NextResponse.json({ success: true, data: insights });
  } catch (err: any) {
    const status = err.statusCode || 500;
    return NextResponse.json({ success: false, error: err.message || 'Failed to list insights' }, { status });
  }
}

// On-demand refresh trigger for the current user's (optionally project-scoped) Phase 78A
// analysis pass — the same entry point a future scheduled job would call. Project-scoped runs
// require at least EDIT_PROJECT, since triggering a fresh analysis pass is a heavier action than
// a passive read (mirrors the same choice made for /api/projects/[id]/intelligence's POST).
export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(req);
    const body = await req.json().catch(() => ({}));
    const projectId = typeof body?.projectId === 'string' ? body.projectId : undefined;

    if (projectId) {
      await projectAuthorizationService.authorizeProjectAccess(user.id, projectId, 'EDIT_PROJECT');
    }

    const result = await knowledgeIntelligenceOrchestrator.runAnalysisForUser(user.id, projectId);
    return NextResponse.json({ success: true, data: result });
  } catch (err: any) {
    const status = err.statusCode || 500;
    return NextResponse.json({ success: false, error: err.message || 'Failed to run analysis' }, { status });
  }
}
