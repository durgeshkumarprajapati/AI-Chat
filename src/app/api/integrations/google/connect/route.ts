import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { googleAuthService } from '@/features/integrations/google/google-auth.service';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const authUrl = googleAuthService.getGoogleAuthUrl(user.id);
    return NextResponse.redirect(authUrl);
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to initiate Google OAuth connect flow' },
      { status: 400 }
    );
  }
}
