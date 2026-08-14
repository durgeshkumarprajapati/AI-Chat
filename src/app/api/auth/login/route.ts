import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { passwordService } from '@/features/auth/password.service';
import { sessionService } from '@/features/auth/session.service';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';

    if (!email || !password) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Email and password parameters are required.' } },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.passwordHash || !passwordService.verifyPassword(password, user.passwordHash)) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Invalid email or password.' } },
        { status: 401 }
      );
    }

    const sessionToken = await sessionService.createSession(user.id);
    sessionService.setSessionCookie(sessionToken);

    return NextResponse.json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          avatarUrl: user.avatarUrl
        },
        sessionToken
      }
    });
  } catch (error) {
    console.error('POST /api/auth/login error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_SERVER_ERROR', message: 'Authentication failed.' } },
      { status: 500 }
    );
  }
}
