import { prisma } from '@/lib/prisma';
import { WebhookProcessingStatus } from '@prisma/client';

export class WebhookEventRepository {
  /**
   * Idempotency gate: returns null (already recorded) instead of throwing, so callers can
   * short-circuit cleanly on a duplicate Razorpay delivery without a try/catch on a unique
   * constraint violation.
   */
  public async recordIfNew(input: { eventId: string; eventType: string; rawPayload: unknown; signatureVerified: boolean }) {
    const existing = await prisma.billingWebhookEvent.findUnique({ where: { eventId: input.eventId } });
    if (existing) return null;

    try {
      return await prisma.billingWebhookEvent.create({
        data: {
          eventId: input.eventId,
          eventType: input.eventType,
          rawPayload: input.rawPayload as any,
          signatureVerified: input.signatureVerified,
          status: 'RECEIVED'
        }
      });
    } catch (err: any) {
      // Race: two concurrent deliveries of the same event both passed the findUnique check.
      // The unique constraint on eventId is the true guard; treat P2002 as "already recorded".
      if (err?.code === 'P2002') return null;
      throw err;
    }
  }

  public async markProcessed(eventId: string, status: WebhookProcessingStatus, processingError?: string | null) {
    return prisma.billingWebhookEvent.update({
      where: { eventId },
      data: { status, processingError: processingError ?? null, processedAt: new Date() }
    });
  }
}

export const webhookEventRepository = new WebhookEventRepository();
