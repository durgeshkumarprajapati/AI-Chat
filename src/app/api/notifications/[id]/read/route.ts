import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { notificationService } from '@/features/notifications/notification.service';

export const dynamic = 'force-dynamic';

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthUser(req);
    const success = await notificationService.markAsRead(params.id, user.id);
    if (!success) {
      return NextResponse.json({ success: false, error: 'Notification not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: { read: true } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = msg.includes('Unauthorized') ? 401 : 400;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}
