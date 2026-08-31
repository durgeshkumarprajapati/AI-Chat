import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { kgExplorerService } from '@/features/knowledge-graph-explorer/services/kg-explorer.service';
import { kgExplorerRateLimitService } from '@/features/knowledge-graph-explorer/security/kg-explorer-rate-limit.service';
import { mapExplorerError } from '@/features/knowledge-graph-explorer/api/kg-explorer-route-helpers';
import { ExplorerQueryRequest, ExplorerScope } from '@/features/knowledge-graph-explorer/types/kg-explorer.types';

export const dynamic = 'force-dynamic';

/**
 * GET /api/knowledge-graph/explorer — simple/bookmarkable query form via query params. A POST
 * counterpart exists at /explorer/query for the richer `filters` object, which doesn't serialize
 * cleanly to query params. Both share identical behavior.
 *
 * Design choice: a soft per-request deadline inside the service degrades to a partial, valid 200
 * response (`truncated: true, truncationReason: 'TIMEOUT'`) rather than a 504 — a partial graph is
 * a better UX than an error for a soft timeout. This route never manufactures its own 504; it only
 * ever returns whatever status the thrown `AppError` (or a generic 500) carries.
 */
export async function GET(req: NextRequest) {
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

    const { searchParams } = new URL(req.url);
    const scope = searchParams.get('scope') as ExplorerScope | null;
    if (!scope) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'scope is required.' } },
        { status: 400 }
      );
    }

    const request: ExplorerQueryRequest = {
      scope,
      query: searchParams.get('q') || undefined,
      projectId: searchParams.get('projectId') || undefined,
      knowledgeBaseId: searchParams.get('knowledgeBaseId') || undefined,
      depth: searchParams.get('depth') ? parseInt(searchParams.get('depth')!, 10) : undefined
    };

    const data = await kgExplorerService.query(user.id, user.role, request, {
      ip: req.headers.get('x-forwarded-for') ?? undefined
    });

    return NextResponse.json({ success: true, data });
  } catch (err) {
    return mapExplorerError(err);
  }
}
