import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser } from '@/lib/auth';
import { projectAuthorizationService } from '@/features/projects/project-authorization.service';
import { insightRepository } from '@/features/knowledge-intelligence/insight.repository';
import { AuthorizationError, NotFoundError } from '@/errors';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireAuthenticatedUser(req);

    // Unscoped-by-owner lookup, immediately followed by an explicit authorization check below —
    // never returned to the caller without one of the two branches succeeding.
    const insight = await insightRepository.getInsightByIdUnscoped(params.id);
    if (!insight) {
      throw new NotFoundError('Insight');
    }

    if (insight.userId !== user.id) {
      if (!insight.projectId) {
        throw new AuthorizationError('You are not authorized to view this insight.');
      }
      await projectAuthorizationService.authorizeProjectAccess(user.id, insight.projectId, 'VIEW_PROJECT');
    }

    return NextResponse.json({ success: true, data: insight });
  } catch (err: any) {
    const status = err.statusCode || 500;
    return NextResponse.json({ success: false, error: err.message || 'Failed to fetch insight' }, { status });
  }
}
