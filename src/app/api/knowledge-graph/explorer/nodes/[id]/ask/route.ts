import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { kgExplorerService } from '@/features/knowledge-graph-explorer/services/kg-explorer.service';
import { kgExplorerRateLimitService } from '@/features/knowledge-graph-explorer/security/kg-explorer-rate-limit.service';
import { mapExplorerError } from '@/features/knowledge-graph-explorer/api/kg-explorer-route-helpers';

export const dynamic = 'force-dynamic';

/**
 * POST /api/knowledge-graph/explorer/nodes/[id]/ask — "ask AI" about one node, grounded in its
 * evidence/neighbors via the RAG gateway. Applies the SAME per-user rate limiter as the other
 * routes but keyed with a distinct suffix (`:ask`) so a burst of graph browsing doesn't exhaust
 * the budget for the more expensive LLM-backed endpoint, and vice versa — a deliberately separate
 * bucket, not a stricter numeric limit, since LLM cost control is really about isolating this
 * endpoint's traffic rather than making it categorically rarer.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getAuthUser(req);

    const allowed = await kgExplorerRateLimitService.checkRateLimit(user.id, ':ask');
    if (!allowed) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'RATE_LIMITED', message: 'Too many "Ask AI" requests. Please try again shortly.' }
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
    if (typeof body.question !== 'string' || !body.question.trim()) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'question is required.' } },
        { status: 400 }
      );
    }

    const data = await kgExplorerService.askAboutNode(user.id, user.role, params.id, body.question, {
      scope: body.scope,
      projectId: typeof body.projectId === 'string' ? body.projectId : undefined,
      knowledgeBaseId: typeof body.knowledgeBaseId === 'string' ? body.knowledgeBaseId : undefined
    });

    return NextResponse.json({ success: true, data });
  } catch (err) {
    return mapExplorerError(err);
  }
}
