import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { studySessionService } from '@/features/study';
import { AppError } from '@/errors';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthUser(req);
    const body = await req.json();
    if (!body.questionId || typeof body.answer !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Missing questionId or answer' },
        { status: 400 }
      );
    }

    const result = await studySessionService.submitAnswer(user.id, params.id, {
      questionId: body.questionId,
      answer: body.answer,
      hintsUsed: body.hintsUsed || 0
    });

    return NextResponse.json({ success: true, data: result });
  } catch (err: any) {
    const status = err instanceof AppError ? err.statusCode : 500;
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to submit answer' },
      { status }
    );
  }
}
