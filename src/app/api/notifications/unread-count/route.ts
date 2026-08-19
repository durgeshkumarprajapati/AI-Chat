import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { notificationService } from '@/features/notifications/notification.service';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    const count = await notificationService.getUnreadCount(user.id);
    return NextResponse.json({ success: true, data: { unreadCount: count } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = msg.includes('Unauthorized') ? 401 : 400;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}
