import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { studySessionService } from '@/features/study/service/study-session.service';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: { id: string; cardId: string } }) {
  try {
    const user = await getAuthUser(req);
    const body = await req.json();

    if (!body.rating) {
      return NextResponse.json({ success: false, error: 'rating is required' }, { status: 400 });
    }

    const updated = await studySessionService.rateFlashcard(user.id, params.id, params.cardId, body.rating);
    return NextResponse.json({ success: true, data: updated });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
