import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { passwordService } from '@/features/auth/password.service';

/**
 * Password Recovery Request endpoint.
 * Always returns generic safe message: "If an account exists for this email, a password reset link has been sent."
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';

    if (email && email.includes('@')) {
      const user = await prisma.user.findUnique({ where: { email } });
      if (user) {
        const { token, hash } = passwordService.generateResetToken();
        const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour expiry
        await prisma.user.update({
          where: { id: user.id },
          data: {
            passwordResetToken: hash,
            passwordResetExpires: expires
          }
        });
        // In production, send token link via email service.
        console.log(`[PasswordReset] Reset token generated for ${email}: ${token}`);
      }
    }

    return NextResponse.json({
      success: true,
      message: 'If an account exists for this email, a password reset link has been sent.'
    });
  } catch (error) {
    console.error('POST /api/auth/password-reset error:', error);
    return NextResponse.json({
      success: true,
      message: 'If an account exists for this email, a password reset link has been sent.'
    });
  }
}

/**
 * Password Reset Execution endpoint.
 */
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const token = typeof body.token === 'string' ? body.token.trim() : '';
    const newPassword = typeof body.newPassword === 'string' ? body.newPassword : '';

    if (!token || !newPassword) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Token and newPassword are required.' } },
        { status: 400 }
      );
    }

    const strength = passwordService.validatePasswordStrength(newPassword);
    if (!strength.isValid) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: strength.reason } },
        { status: 400 }
      );
    }

    const user = await prisma.user.findFirst({
      where: {
        passwordResetExpires: { gte: new Date() }
      }
    });

    if (!user) {
      return NextResponse.json(
        { success: false, error: { code: 'BAD_REQUEST', message: 'Invalid or expired password reset token.' } },
        { status: 400 }
      );
    }

    const newHash = passwordService.hashPassword(newPassword);
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: newHash,
        passwordResetToken: null,
        passwordResetExpires: null
      }
    });

    return NextResponse.json({
      success: true,
      message: 'Password updated successfully.'
    });
  } catch (error) {
    console.error('PUT /api/auth/password-reset error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_SERVER_ERROR', message: 'Password reset failed.' } },
      { status: 500 }
    );
  }
}
