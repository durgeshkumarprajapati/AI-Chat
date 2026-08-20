import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { googleAuthService } from '@/features/integrations/google/google-auth.service';

export async function DELETE(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    await googleAuthService.disconnectGoogle(user.id);
    return NextResponse.json({ success: true, message: 'Google Calendar integration disconnected' }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to disconnect Google Calendar integration' },
      { status: 400 }
    );
  }
}
