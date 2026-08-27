import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { clickUpAuthService } from '@/features/meeting-intelligence';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const authUser = await getAuthUser(req);
    const { searchParams } = new URL(req.url);
    const code = searchParams.get('code') || 'mock_code';

    await clickUpAuthService.handleOAuthCallback(authUser.id, code);

    return NextResponse.redirect(new URL('/meetings?clickup=connected', req.url));
  } catch (error) {
    return NextResponse.redirect(new URL('/meetings?clickup=error', req.url));
  }
}
