import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { pushSubscriptionService } from '@/features/notifications/push-subscription.service';
import { AppError } from '@/errors';

export const dynamic = 'force-dynamic';

/** Saves (or refreshes) the caller's own browser push subscription — never accepts a userId in the body. */
export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    const body = await req.json().catch(() => ({}));

    await pushSubscriptionService.subscribe(user.id, {
      endpoint: body.endpoint,
      keys: { p256dh: body.keys?.p256dh, auth: body.keys?.auth },
      userAgent: req.headers.get('user-agent') || undefined
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof AppError) {
      return NextResponse.json({ success: false, error: err.message }, { status: err.statusCode });
    }
    const msg = err instanceof Error ? err.message : String(err);
    const status = msg.includes('Unauthorized') ? 401 : 400;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}

/** Removes the caller's own subscription for a given endpoint (e.g. the user disabled notifications in-browser). */
export async function DELETE(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    const body = await req.json().catch(() => ({}));
    if (!body.endpoint) {
      return NextResponse.json({ success: false, error: 'endpoint is required' }, { status: 400 });
    }

    await pushSubscriptionService.unsubscribe(user.id, body.endpoint);
    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = msg.includes('Unauthorized') ? 401 : 400;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}
