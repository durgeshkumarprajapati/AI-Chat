import { NextRequest, NextResponse } from 'next/server';
import { razorpayWebhookService } from '@/features/billing';

export const dynamic = 'force-dynamic';

/**
 * Razorpay webhook receiver. Deliberately unauthenticated (Razorpay cannot present a session
 * cookie) — signature verification via RAZORPAY_WEBHOOK_SECRET is the sole trust boundary.
 * Stays live even when BILLING_ENABLED=false ("webhooks can remain available for production
 * readiness" per spec): with no webhook secret configured, verification fails closed and every
 * delivery is rejected, so there is no behavior difference from the route not existing.
 */
export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get('x-razorpay-signature');
  const eventId = req.headers.get('x-razorpay-event-id');

  const result = await razorpayWebhookService.process(rawBody, signature, eventId);

  if (result.status === 'REJECTED') {
    return NextResponse.json({ success: false, error: { code: 'WEBHOOK_REJECTED', message: result.reason } }, { status: 400 });
  }

  return NextResponse.json({ success: true, data: { status: result.status } }, { status: 200 });
}
