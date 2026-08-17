import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { studyRepository } from '@/features/study';
import { StudySessionStatus } from '@prisma/client';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthUser(req);
    const session = await studyRepository.getSessionById(params.id, user.id);
    if (!session) return NextResponse.json({ success: false, error: 'Session not found' }, { status: 404 });

    await studyRepository.updateSessionStatus(params.id, StudySessionStatus.PAUSED);
    return NextResponse.json({ success: true, message: 'Session paused' });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
