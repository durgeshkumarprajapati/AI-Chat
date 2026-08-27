import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { clickUpAuthService } from '@/features/meeting-intelligence';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    await getAuthUser(req);
    const url = clickUpAuthService.getConnectUrl();
    return NextResponse.redirect(url);
  } catch {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
}
