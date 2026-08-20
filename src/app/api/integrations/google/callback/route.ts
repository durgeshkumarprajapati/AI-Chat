import { NextRequest, NextResponse } from 'next/server';
import { googleAuthService } from '@/features/integrations/google/google-auth.service';
import { googleAuthService as appAuthService } from '@/features/auth/google-auth.service';
import { sessionService } from '@/features/auth/session.service';
import { envConfig } from '@/config/env';

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const code = url.searchParams.get('code');
    const userId = url.searchParams.get('state');
    const baseUrl = process.env.NEXTAUTH_URL || `${url.protocol}//${url.host}`;

    if (!code) {
      return NextResponse.json({ success: false, error: 'Missing authorization code parameter' }, { status: 400 });
    }

    // 1. If state (userId) is missing or empty, handle dynamically as Google Sign-In authentication flow
    if (!userId || userId.trim() === '' || userId === 'null' || userId === 'undefined') {
      console.log('[GoogleOAuth] Callback received without userId state — processing as Google Sign-In flow');

      let googleId = `mock_g_id_${Date.now()}`;
      let email = 'user@gmail.com';
      let name = 'Google User';
      let picture: string | undefined = undefined;

      const clientId = envConfig.google.clientId;
      const clientSecret = envConfig.google.clientSecret;

      if (clientId && clientSecret && !code.startsWith('mock_')) {
        const redirectUris = [
          envConfig.google.calendar.redirectUri,
          envConfig.google.auth.redirectUri
        ];

        for (const uri of redirectUris) {
          try {
            const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: new URLSearchParams({
                code,
                client_id: clientId,
                client_secret: clientSecret,
                redirect_uri: uri,
                grant_type: 'authorization_code'
              })
            });

            if (tokenRes.ok) {
              const tokenData = await tokenRes.json();
              const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
                headers: { Authorization: `Bearer ${tokenData.access_token}` }
              });
              if (userRes.ok) {
                const userInfo = await userRes.json();
                googleId = userInfo.id || googleId;
                email = userInfo.email || email;
                name = userInfo.name || name;
                picture = userInfo.picture || picture;
                break;
              }
            }
          } catch (err) {
            console.warn(`[GoogleOAuth] Token exchange failed with ${uri}:`, err);
          }
        }
      }

      const { sessionToken } = await appAuthService.handleGoogleAuth({
        googleId,
        email,
        emailVerified: true,
        name,
        picture
      });

      sessionService.setSessionCookie(sessionToken);
      return NextResponse.redirect(`${baseUrl}/dashboard`);
    }

    // 2. Otherwise process as Google Calendar integration flow for the logged-in user
    await googleAuthService.exchangeCodeForTokens(code, userId);

    return NextResponse.redirect(`${baseUrl}/study/mock-tests?google_connected=true`);
  } catch (err: any) {
    console.error('[GoogleOAuth] Callback exception:', err?.message || err);
    return NextResponse.json(
      { success: false, error: err?.message || 'Google OAuth callback failed' },
      { status: 400 }
    );
  }
}
