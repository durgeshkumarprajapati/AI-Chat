import webpush from 'web-push';
import { env } from '@/config/env';
import { prisma } from '@/lib/prisma';

export interface WebPushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  icon?: string;
}

/**
 * Thin wrapper around the `web-push` library (the standard Web Push protocol implementation —
 * works identically against Chrome/Firefox/Edge's FCM-backed endpoints and Safari 16.4+'s
 * native Web Push endpoint; no per-browser code needed). VAPID keys are secrets and live only
 * in env vars, never in the Config table, matching this codebase's established secret-isolation
 * pattern (see billing's Razorpay credentials).
 */
export class WebPushService {
  private configured = false;

  constructor() {
    const publicKey = env.server?.VAPID_PUBLIC_KEY;
    const privateKey = env.server?.VAPID_PRIVATE_KEY;
    if (publicKey && privateKey) {
      webpush.setVapidDetails(env.server?.VAPID_SUBJECT || 'mailto:admin@example.com', publicKey, privateKey);
      this.configured = true;
    }
  }

  public isConfigured(): boolean {
    return this.configured;
  }

  public getPublicKey(): string | undefined {
    return env.server?.VAPID_PUBLIC_KEY;
  }

  /**
   * Sends to every stored subscription for a user. Never throws — a push failure must never
   * break notification creation, which already succeeded (DB row + SSE event) before this runs.
   * Automatically removes subscriptions the push service reports as gone (404/410 — the
   * standard signal a browser unsubscribed or the endpoint expired).
   */
  public async sendToUser(userId: string, payload: WebPushPayload): Promise<void> {
    if (!this.configured) return;

    try {
      const subscriptions = await prisma.pushSubscription.findMany({ where: { userId } });
      if (subscriptions.length === 0) return;

      await Promise.all(
        subscriptions.map(async (sub) => {
          try {
            await webpush.sendNotification(
              { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
              JSON.stringify(payload)
            );
            await prisma.pushSubscription.update({ where: { id: sub.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
          } catch (err: any) {
            if (err?.statusCode === 404 || err?.statusCode === 410) {
              await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
            } else {
              console.warn(`[WebPushService] Failed to deliver push to subscription ${sub.id}:`, err?.message || err);
            }
          }
        })
      );
    } catch (err) {
      console.warn('[WebPushService] sendToUser failed safely:', err);
    }
  }
}

export const webPushService = new WebPushService();
