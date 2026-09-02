import { NextRequest, NextResponse } from 'next/server';
import { envConfig } from '@/config/env';
import { googleAuthService } from '@/features/auth/google-auth.service';
import { sessionService } from '@/features/auth/session.service';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const clientId = envConfig.google.clientId;
    const clientSecret = envConfig.google.clientSecret;

    // In local development without real Google OAuth credentials, redirect to local dev callback
    if (!clientId || clientId === 'mock-google-client-id' || !clientSecret) {
      const url = new URL(req.url);
      const baseUrl = process.env.NEXTAUTH_URL || `${url.protocol}//${url.host}`;
      return NextResponse.redirect(`${baseUrl}/api/auth/google/callback?code=mock_dev_google_code`);
    }

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

    const res = NextResponse.json({
      success: true,
      data: {
        user,
        sessionToken
      }
    });

    sessionService.attachSessionCookie(res, sessionToken);
    return res;
  } catch (error) {
    console.error('POST /api/auth/google error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'UNAUTHORIZED', message: error instanceof Error ? error.message : 'Google authentication failed.' } },
      { status: 401 }
    );
  }
}
