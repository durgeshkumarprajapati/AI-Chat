import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { chatService } from '@/features/rag/chat/chat.service';
import { AppError } from '@/errors';

export async function GET(req: NextRequest) {
  try {
    const authUser = await getAuthUser(req);
    const searchParams = req.nextUrl.searchParams;

    const page = searchParams.get('page') ? Number(searchParams.get('page')) : undefined;
    const pageSize = searchParams.get('pageSize') ? Number(searchParams.get('pageSize')) : undefined;
    const search = searchParams.get('search') || undefined;
    const knowledgeBaseId = searchParams.get('knowledgeBaseId') || undefined;
    const sortBy = searchParams.get('sortBy') || undefined;
    const sortOrder = (searchParams.get('sortOrder') as 'asc' | 'desc') || undefined;

    const result = await chatService.listUserConversationsPaginated(authUser.id, {
      page,
      pageSize,
      search,
      knowledgeBaseId,
      sortBy,
      sortOrder
    });

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(
        { success: false, error: { code: error.code, message: error.message } },
        { status: error.statusCode }
      );
    }
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to retrieve conversations' } },
      { status: 500 }
    );
  }
}
