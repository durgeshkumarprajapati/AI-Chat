import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { passwordService } from '@/features/auth/password.service';
import { sessionService } from '@/features/auth/session.service';
import { UserRole } from '@prisma/client';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const name = typeof body.name === 'string' ? body.name.trim() : null;

    if (!email || !email.includes('@')) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Valid email address is required.' } },
        { status: 400 }
      );
    }

    const strength = passwordService.validatePasswordStrength(password);
    if (!strength.isValid) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: strength.reason } },
        { status: 400 }
      );
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json(
        { success: false, error: { code: 'CONFLICT_ERROR', message: 'An account with this email address already exists.' } },
        { status: 409 }
      );
    }

    const passwordHash = passwordService.hashPassword(password);
    const user = await prisma.user.create({
      data: {
        email,
        name,
        passwordHash,
        role: UserRole.USER
      }
    });

    const sessionToken = await sessionService.createSession(user.id);
    sessionService.setSessionCookie(sessionToken);

    const res = NextResponse.json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role
        },
        sessionToken
      }
    });

    sessionService.attachSessionCookie(res, sessionToken);
    return res;
  } catch (error) {
    console.error('POST /api/auth/register error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_SERVER_ERROR', message: 'Registration failed.' } },
      { status: 500 }
    );
  }
}
