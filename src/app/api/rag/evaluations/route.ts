import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { evaluationService } from '@/features/rag/evaluation/evaluation.service';
import { AppError } from '@/errors';
import { FeedbackRating } from '@prisma/client';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const authUser = await getAuthUser(req);
    const searchParams = req.nextUrl.searchParams;

    const page = searchParams.get('page') ? Number(searchParams.get('page')) : undefined;
    const pageSize = searchParams.get('pageSize') ? Number(searchParams.get('pageSize')) : undefined;
    const knowledgeBaseId = searchParams.get('knowledgeBaseId') || undefined;
    const rating = (searchParams.get('rating') as FeedbackRating) || undefined;
    const search = searchParams.get('search') || undefined;

    const result = await evaluationService.listEvaluationsPaginated(authUser.id, {
      page,
      pageSize,
      knowledgeBaseId,
      rating,
      search
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
      { success: false, error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to list evaluation records' } },
      { status: 500 }
    );
  }
}
