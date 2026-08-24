import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { knowledgeBaseService } from '@/features/knowledge-bases/services/knowledge-base.service';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    const { searchParams } = new URL(req.url);

    const page = searchParams.get('page') ? Number(searchParams.get('page')) : 1;
    const pageSize = searchParams.get('pageSize') ? Number(searchParams.get('pageSize')) : 20;
    const search = searchParams.get('search') || undefined;
    const sortBy = searchParams.get('sortBy') || 'createdAt';
    const sortOrder = searchParams.get('sortOrder') === 'asc' ? 'asc' : 'desc';

    const result = await knowledgeBaseService.listKnowledgeBasesPaginated(user.id, {
      page,
      pageSize,
      search,
      sortBy,
      sortOrder
    });

    return NextResponse.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('GET /api/knowledge-bases error:', error);
    const statusCode = (error as { statusCode?: number }).statusCode || 500;
    const message = (error as Error).message || 'Internal Server Error';
    return NextResponse.json({ success: false, error: { message } }, { status: statusCode });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    const body = await req.json();

    const created = await knowledgeBaseService.createKnowledgeBase(user.id, {
      name: body.name,
      description: body.description
    });

    return NextResponse.json({
      success: true,
      data: created
    }, { status: 201 });
  } catch (error) {
    console.error('POST /api/knowledge-bases error:', error);
    const statusCode = (error as { statusCode?: number }).statusCode || 500;
    const message = (error as Error).message || 'Internal Server Error';
    return NextResponse.json({ success: false, error: { message } }, { status: statusCode });
  }
}
