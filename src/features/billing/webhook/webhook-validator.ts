import Razorpay from 'razorpay';
import { env } from '@/config/env';

/**
 * Verifies a Razorpay webhook signature using the SDK's own constant-time HMAC-SHA256
 * comparison. `rawBody` MUST be the exact, unparsed request body bytes (as text) — signature
 * verification fails if the body has been re-serialized by JSON.parse/stringify.
 */
export function verifyRazorpaySignature(rawBody: string, signatureHeader: string | null): boolean {
  const secret = env.server?.RAZORPAY_WEBHOOK_SECRET || process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret || !signatureHeader) return false;

  try {
    return Razorpay.validateWebhookSignature(rawBody, signatureHeader, secret);
  } catch {
    return false;
  }
}

export function isRazorpayWebhookConfigured(): boolean {
  return Boolean(env.server?.RAZORPAY_WEBHOOK_SECRET || process.env.RAZORPAY_WEBHOOK_SECRET);
}
