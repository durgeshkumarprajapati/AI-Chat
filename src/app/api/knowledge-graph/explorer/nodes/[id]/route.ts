import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { kgExplorerService } from '@/features/knowledge-graph-explorer/services/kg-explorer.service';
import { mapExplorerError } from '@/features/knowledge-graph-explorer/api/kg-explorer-route-helpers';
import { ExplorerScope } from '@/features/knowledge-graph-explorer/types/kg-explorer.types';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
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

    const data = await kgExplorerService.getNodeDetail(user.id, user.role, params.id, {
      scope,
      projectId: searchParams.get('projectId') || undefined,
      knowledgeBaseId: searchParams.get('knowledgeBaseId') || undefined
    });

    return NextResponse.json({ success: true, data });
  } catch (err) {
    return mapExplorerError(err);
  }
}
