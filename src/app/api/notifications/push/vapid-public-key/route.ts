import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { webPushService } from '@/features/notifications/web-push.service';

export const dynamic = 'force-dynamic';

/** The VAPID public key is not sensitive (it's sent to browsers on every subscribe call by design) — only the private key is a secret. */
export async function GET(req: NextRequest) {
  try {
    await getAuthUser(req);
    if (!webPushService.isConfigured()) {
      return NextResponse.json({ success: true, data: { configured: false, publicKey: null } });
    }
    return NextResponse.json({ success: true, data: { configured: true, publicKey: webPushService.getPublicKey() } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = msg.includes('Unauthorized') ? 401 : 400;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}
