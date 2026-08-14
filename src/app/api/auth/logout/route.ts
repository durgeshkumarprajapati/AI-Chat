import { NextRequest, NextResponse } from 'next/server';
import { sessionService } from '@/features/auth/session.service';
import { cookies } from 'next/headers';

export async function POST(req: NextRequest) {
  try {
    const cookieHeader = req.headers.get('cookie') || '';
    const sessionMatch = cookieHeader.match(/rag_session_token=([^;]+)/);
    const sessionToken = sessionMatch ? sessionMatch[1] : null;

    if (sessionToken) {
      await sessionService.invalidateSession(sessionToken);
    }

    try {
      const cookieStore = cookies();
      cookieStore.delete('rag_session_token');
    } catch {
      // Ignore
    }

    return NextResponse.json({
      success: true,
      message: 'Logged out successfully.'
    });
  } catch (error) {
    console.error('POST /api/auth/logout error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_SERVER_ERROR', message: 'Logout failed.' } },
      { status: 500 }
    );
  }
}
