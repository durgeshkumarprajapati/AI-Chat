import { NextRequest, NextResponse } from 'next/server';
import { googleAuthService } from '@/features/integrations/google/google-auth.service';

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const code = url.searchParams.get('code');
    const userId = url.searchParams.get('state');

    if (!userId) {
      return NextResponse.json({ success: false, error: 'Invalid state parameter (userId missing)' }, { status: 400 });
    }

    if (!code) {
      return NextResponse.json({ success: false, error: 'Missing authorization code parameter' }, { status: 400 });
    }

    // Exchange code for real tokens & authenticated user identity
    await googleAuthService.exchangeCodeForTokens(code, userId);

    const baseUrl = process.env.NEXTAUTH_URL || `${url.protocol}//${url.host}`;
    return NextResponse.redirect(`${baseUrl}/study/mock-tests?google_connected=true`);
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || 'Google OAuth callback failed' },
      { status: 400 }
    );
  }
}
