import { NextRequest, NextResponse } from 'next/server';
import { googleAuthService } from '@/features/auth/google-auth.service';
import { sessionService } from '@/features/auth/session.service';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const authUrl = googleAuthService.getSignInAuthUrl();
    return NextResponse.redirect(authUrl);
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to initiate Google Sign-In flow' },
      { status: 400 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { googleId, email, emailVerified, name, picture } = body;

    if (!googleId || !email || emailVerified === false) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Verified Google OAuth identity required.' } },
        { status: 400 }
      );
    }

    const { user, sessionToken } = await googleAuthService.handleGoogleAuth({
      googleId: String(googleId),
      email: String(email).trim().toLowerCase(),
      emailVerified: Boolean(emailVerified),
      name: typeof name === 'string' ? name : undefined,
      picture: typeof picture === 'string' ? picture : undefined
    });

    sessionService.setSessionCookie(sessionToken);

    return NextResponse.json({
      success: true,
      data: {
        user,
        sessionToken
      }
    });
  } catch (error) {
    console.error('POST /api/auth/google error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'UNAUTHORIZED', message: error instanceof Error ? error.message : 'Google authentication failed.' } },
      { status: 401 }
    );
  }
}
