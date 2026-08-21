import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { chillFocusPreferenceService } from '@/features/chill-focus/chill-focus.preference.service';
import { updatePreferencesSchema } from '@/features/chill-focus/chill-focus.schemas';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    const pref = await chillFocusPreferenceService.getPreferences(user.id);
    return NextResponse.json({ success: true, data: pref });
  } catch (err: any) {
    const msg = err?.message || String(err);
    const status = msg.includes('Unauthorized') ? 401 : 400;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    const body = await req.json().catch(() => ({}));
    const parsed = updatePreferencesSchema.parse(body);

    const pref = await chillFocusPreferenceService.updatePreferences(user.id, parsed);
    return NextResponse.json({ success: true, data: pref });
  } catch (err: any) {
    const msg = err?.message || String(err);
    const status = msg.includes('Unauthorized') ? 401 : 400;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}
