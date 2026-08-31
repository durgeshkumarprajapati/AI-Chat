import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { kgExplorerService } from '@/features/knowledge-graph-explorer/services/kg-explorer.service';
import { mapExplorerError } from '@/features/knowledge-graph-explorer/api/kg-explorer-route-helpers';
import { ExplorerScope } from '@/features/knowledge-graph-explorer/types/kg-explorer.types';

export const dynamic = 'force-dynamic';

/**
 * GET /api/knowledge-graph/explorer/relationships — the distinct set of relationship types
 * actually present in the given scope, powering the UI's filter dropdown honestly (only real
 * types the user could actually see, never the full static enum).
 */
export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    const { searchParams } = new URL(req.url);
    const scope = searchParams.get('scope') as ExplorerScope | null;
    if (!scope) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'scope is required.' } },
        { status: 400 }
      );
    }

    const data = await kgExplorerService.getRelationshipTypesInScope(
      user.id,
      user.role,
      scope,
      searchParams.get('projectId') || undefined,
      searchParams.get('knowledgeBaseId') || undefined
    );

    return NextResponse.json({ success: true, data });
  } catch (err) {
    return mapExplorerError(err);
  }
}
