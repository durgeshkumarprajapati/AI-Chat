import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { evaluationService } from '@/features/rag/evaluation/evaluation.service';
import { AppError } from '@/errors';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const authUser = await getAuthUser(req);
    const evaluationId = params.id;

    const detail = await evaluationService.getEvaluationDetail(authUser.id, evaluationId);
    return NextResponse.json({ success: true, data: detail });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(
        { success: false, error: { code: error.code, message: error.message } },
        { status: error.statusCode }
      );
    }
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to retrieve evaluation detail' } },
      { status: 500 }
    );
  }
}
