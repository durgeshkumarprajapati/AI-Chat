import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { notificationPreferencesService } from '@/features/notifications/notification-preferences.service';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    const prefs = await notificationPreferencesService.getPreferences(user.id);
    return NextResponse.json({ success: true, data: prefs });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = msg.includes('Unauthorized') ? 401 : 400;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    const body = await req.json();

    const prefs = await notificationPreferencesService.updatePreferences(user.id, body);
    return NextResponse.json({ success: true, data: prefs });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = msg.includes('Unauthorized') ? 401 : 400;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}
