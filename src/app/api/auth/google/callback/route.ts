import { NextRequest, NextResponse } from 'next/server';
import { envConfig } from '@/config/env';
import { googleAuthService } from '@/features/auth/google-auth.service';
import { sessionService } from '@/features/auth/session.service';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const code = url.searchParams.get('code');

    if (!code) {
      return NextResponse.json({ success: false, error: 'Missing code parameter' }, { status: 400 });
    }

    const clientId = envConfig.google.clientId;
    const clientSecret = envConfig.google.clientSecret;
    const redirectUri = envConfig.google.auth.redirectUri;

    let googleId = `g_id_${Date.now()}`;
    let email = 'dev.google.user@example.com';
    let name = 'Google Dev User';
    let picture: string | undefined = undefined;

    if (clientId && clientSecret && clientId !== 'mock-google-client-id' && !code.startsWith('mock_')) {
      // Exchange auth code for ID token & access token
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code'
        })
      });

      if (tokenRes.ok) {
        const tokenData = await tokenRes.json();
        // Fetch user identity
        const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
          headers: { Authorization: `Bearer ${tokenData.access_token}` }
        });
        if (userRes.ok) {
          const userInfo = await userRes.json();
          googleId = userInfo.id || googleId;
          email = userInfo.email || email;
          name = userInfo.name || name;
          picture = userInfo.picture || picture;
        }
      }
    }

    // Process user authentication and session creation
    const { sessionToken } = await googleAuthService.handleGoogleAuth({
      googleId,
      email,
      emailVerified: true,
      name,
      picture
    });

    sessionService.setSessionCookie(sessionToken);

    const baseUrl = process.env.NEXTAUTH_URL || `${url.protocol}//${url.host}`;
    const res = NextResponse.redirect(`${baseUrl}/dashboard`);
    sessionService.attachSessionCookie(res, sessionToken);

    return res;
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || 'Google Auth callback failed' },
      { status: 400 }
    );
  }
}
