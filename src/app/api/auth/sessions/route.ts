import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { sessionService } from '@/features/auth/session.service';
import { auditService } from '@/features/auth/audit.service';
import { AppError } from '@/errors';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const authUser = await getAuthUser(req);
    const cookieHeader = req.headers.get('cookie') || '';
    const sessionMatch = cookieHeader.match(/rag_session_token=([^;]+)/);
    const sessionToken = sessionMatch ? sessionMatch[1] : undefined;

    const sessions = await sessionService.listUserSessions(authUser.id, sessionToken);

    return NextResponse.json({
      success: true,
      data: sessions
    });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(
        { success: false, error: { code: error.code, message: error.message } },
        { status: error.statusCode }
      );
    }
    return NextResponse.json(
      { success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required.' } },
      { status: 401 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const authUser = await getAuthUser(req);
    const body = await req.json().catch(() => ({}));
    const { sessionId, revokeAll } = body;

    if (revokeAll) {
      await sessionService.invalidateAllUserSessions(authUser.id);
      await auditService.log(authUser.id, 'ALL_SESSIONS_REVOKED', 'USER', authUser.id);
      return NextResponse.json({
        success: true,
        message: 'All active sessions have been revoked.'
      });
    }

    if (!sessionId || typeof sessionId !== 'string') {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'sessionId or revokeAll is required.' } },
        { status: 400 }
      );
    }

    await sessionService.invalidateSession(sessionId);
    await auditService.log(authUser.id, 'SESSION_REVOKED', 'SESSION', sessionId);

    return NextResponse.json({
      success: true,
      message: 'Session revoked successfully.'
    });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(
        { success: false, error: { code: error.code, message: error.message } },
        { status: error.statusCode }
      );
    }
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to revoke session.' } },
      { status: 500 }
    );
  }
}
