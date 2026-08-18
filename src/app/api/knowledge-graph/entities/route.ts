import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { entitySearchService } from '@/features/knowledge-graph/search/entity-search.service';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    const { searchParams } = new URL(req.url);

    const projectId = searchParams.get('projectId');
    const searchQuery = searchParams.get('q') || undefined;

    const entities = await entitySearchService.searchEntities({
      userId: user.id,
      projectId,
      searchQuery
    });

    return NextResponse.json({
      success: true,
      data: entities
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to search entities.' },
      { status: err.status || 500 }
    );
  }
}
