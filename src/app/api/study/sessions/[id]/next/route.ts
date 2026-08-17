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
    const nextQuestion = await studySessionService.nextQuestion(user.id, params.id);
    return NextResponse.json({ success: true, data: nextQuestion });
  } catch (err: any) {
    const status = err instanceof AppError ? err.statusCode : 500;
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to fetch next question' },
      { status }
    );
  }
}
