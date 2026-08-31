import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { kgExplorerService } from '@/features/knowledge-graph-explorer/services/kg-explorer.service';
import { kgExplorerRateLimitService } from '@/features/knowledge-graph-explorer/security/kg-explorer-rate-limit.service';
import { mapExplorerError } from '@/features/knowledge-graph-explorer/api/kg-explorer-route-helpers';
import { ExplorerQueryRequest } from '@/features/knowledge-graph-explorer/types/kg-explorer.types';

export const dynamic = 'force-dynamic';

/**
 * POST /api/knowledge-graph/explorer/query — same behavior as GET /explorer, but accepts the
 * full request (including the richer `filters` object) as a JSON body instead of query params.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser(req);

    const allowed = await kgExplorerRateLimitService.checkRateLimit(user.id);
    if (!allowed) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'RATE_LIMITED', message: 'Too many Knowledge Graph Explorer requests. Please try again shortly.' }
        },
        { status: 429 }
      );
    }

    const body = await req.json().catch(() => ({}));
    if (!body.scope) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'scope is required.' } },
        { status: 400 }
      );
    }

    const request: ExplorerQueryRequest = {
      scope: body.scope,
      query: typeof body.query === 'string' ? body.query : undefined,
      projectId: typeof body.projectId === 'string' ? body.projectId : undefined,
      knowledgeBaseId: typeof body.knowledgeBaseId === 'string' ? body.knowledgeBaseId : undefined,
      depth: typeof body.depth === 'number' ? body.depth : undefined,
      filters: body.filters && typeof body.filters === 'object' ? body.filters : undefined
    };

    const data = await kgExplorerService.query(user.id, user.role, request, {
      ip: req.headers.get('x-forwarded-for') ?? undefined
    });

    return NextResponse.json({ success: true, data });
  } catch (err) {
    return mapExplorerError(err);
  }
}
