import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { evaluationService } from '@/features/rag/evaluation/evaluation.service';
import { AppError } from '@/errors';

export async function GET(req: NextRequest) {
  try {
    const authUser = await getAuthUser(req);
    const searchParams = req.nextUrl.searchParams;

    const timeRange = (searchParams.get('timeRange') as '24h' | '7d' | '30d' | '90d' | 'all') || '30d';
    const knowledgeBaseId = searchParams.get('knowledgeBaseId') || undefined;

    const metrics = await evaluationService.getAggregatedMetrics(authUser.id, {
      timeRange,
      knowledgeBaseId
    });

    return NextResponse.json({ success: true, data: metrics });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(
        { success: false, error: { code: error.code, message: error.message } },
        { status: error.statusCode }
      );
    }
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to compute aggregated RAG metrics' } },
      { status: 500 }
    );
  }
}
