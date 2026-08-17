import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { researchSessionService } from '@/features/research';
import { AppError } from '@/errors';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    const body = await req.json();
    const session = await researchSessionService.createSession(user.id, body);
    return NextResponse.json({ success: true, data: session }, { status: 201 });
  } catch (err: any) {
    const status = err instanceof AppError ? err.statusCode : 500;
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to create research session' },
      { status }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    const sessions = await researchSessionService.getUserSessions(user.id);
    return NextResponse.json({ success: true, data: sessions });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to fetch research sessions' },
      { status: 500 }
    );
  }
}
