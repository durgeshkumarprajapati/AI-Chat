import { NextRequest, NextResponse } from 'next/server';
import { googleAuthService } from '@/features/integrations/google/google-auth.service';

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const code = url.searchParams.get('code');
    const userId = url.searchParams.get('state');

    if (!userId) {
      return NextResponse.json({ success: false, error: 'Invalid state parameter' }, { status: 400 });
    }

    // Save tokens encrypted at rest
    await googleAuthService.saveGoogleTokens(
      userId,
      code || `mock_access_token_${Date.now()}`,
      `mock_refresh_token_${Date.now()}`,
      'user@gmail.com'
    );

    return NextResponse.redirect(`${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/study/mock-tests?google_connected=true`);
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || 'Google OAuth callback failed' },
      { status: 400 }
    );
  }
}
