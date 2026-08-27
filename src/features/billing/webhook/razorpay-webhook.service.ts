import { webhookEventRepository } from '../repositories/webhook-event.repository';
import { transactionRepository } from '../repositories/transaction.repository';
import { subscriptionRepository } from '../repositories/subscription.repository';
import { subscriptionService } from '../subscription.service';
import { auditService } from '@/features/audit/audit.service';
import { billingTelemetryService } from '../billing.telemetry.service';
import { verifyRazorpaySignature } from './webhook-validator';

export interface WebhookProcessResult {
  status: 'PROCESSED' | 'IGNORED' | 'REJECTED';
  reason?: string;
}

function unixToDate(seconds: unknown): Date | undefined {
  return typeof seconds === 'number' && seconds > 0 ? new Date(seconds * 1000) : undefined;
}

/**
 * Idempotent Razorpay webhook processor. Every entry point (razorpay-webhook route) must call
 * `process()` with the raw, unparsed body — signature verification depends on exact bytes.
 * Duplicate deliveries (Razorpay retries on any non-2xx, or occasionally redelivers a 2xx'd
 * event) are detected via the unique `eventId` before any subscription/payment state is
 * touched, so a replay can never double-apply a charge or flip a status twice.
 */
export class RazorpayWebhookService {
  public async process(rawBody: string, signatureHeader: string | null, eventIdHeader: string | null): Promise<WebhookProcessResult> {
    const signatureVerified = verifyRazorpaySignature(rawBody, signatureHeader);
    if (!signatureVerified) {
      billingTelemetryService.logEvent({ event: 'webhook.rejected', error: 'invalid_signature' });
      return { status: 'REJECTED', reason: 'Invalid webhook signature' };
    }

    let payload: any;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return { status: 'REJECTED', reason: 'Invalid JSON body' };
    }

    const eventType: string = payload?.event || 'unknown';
    const eventId: string = eventIdHeader || payload?.payload?.payment?.entity?.id || payload?.payload?.subscription?.entity?.id || `${eventType}:${Date.now()}`;

    const recorded = await webhookEventRepository.recordIfNew({ eventId, eventType, rawPayload: payload, signatureVerified });
    if (!recorded) {
      billingTelemetryService.logEvent({ event: 'webhook.duplicate_ignored', eventType });
      return { status: 'IGNORED', reason: 'Duplicate event' };
    }

    try {
      await this.dispatch(eventType, payload);
      await webhookEventRepository.markProcessed(eventId, 'PROCESSED');
      billingTelemetryService.logEvent({ event: 'webhook.processed', eventType });
      return { status: 'PROCESSED' };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await webhookEventRepository.markProcessed(eventId, 'FAILED', message);
      billingTelemetryService.logEvent({ event: 'webhook.processing_failed', eventType, error: message });
      // Swallow: return PROCESSED-shaped 200 upstream regardless, so Razorpay does not hammer
      // retries for a bug on our side; the FAILED status is surfaced to admins for reconciliation.
      return { status: 'IGNORED', reason: `Processing error: ${message}` };
    }
  }

  private async dispatch(eventType: string, payload: any): Promise<void> {
    switch (eventType) {
      case 'payment.authorized':
      case 'payment.captured':
        return this.handlePaymentSucceeded(payload, eventType === 'payment.captured' ? 'CAPTURED' : 'AUTHORIZED');
      case 'payment.failed':
        return this.handlePaymentFailed(payload);
      case 'subscription.activated':
      case 'subscription.charged':
        return this.handleSubscriptionActivatedOrCharged(payload);
      case 'subscription.completed':
      case 'subscription.cancelled':
        return this.handleSubscriptionEnded(payload);
      default:
        // Unrecognized event types are acknowledged, not treated as errors — Razorpay may add
        // new event types over time.
        return;
    }
  }

  private async handlePaymentSucceeded(payload: any, status: 'CAPTURED' | 'AUTHORIZED'): Promise<void> {
    const entity = payload?.payload?.payment?.entity;
    if (!entity?.order_id) return;

    const transaction = await transactionRepository.findByRazorpayOrderId(entity.order_id);
    if (!transaction) return;

    await transactionRepository.updateByOrderId(entity.order_id, {
      status,
      razorpayPaymentId: entity.id,
      razorpaySignatureVerified: true
    });

    if (transaction.subscriptionId) {
      const sub = await subscriptionRepository.findById(transaction.subscriptionId);
      if (sub && (sub.status === 'PAST_DUE' || sub.status === 'GRACE_PERIOD' || sub.status === 'INCOMPLETE')) {
        await subscriptionService.transition(sub.id, 'ACTIVE', { details: { via: 'webhook', event: 'payment_succeeded' } });
      }
    }

    await auditService.logEvent({
      actorId: transaction.userId,
      action: 'PAYMENT_SUCCEEDED',
      targetType: 'PAYMENT_TRANSACTION',
      targetId: transaction.id,
      details: { razorpayOrderId: entity.order_id, status }
    });
  }

  private async handlePaymentFailed(payload: any): Promise<void> {
    const entity = payload?.payload?.payment?.entity;
    if (!entity?.order_id) return;

    const transaction = await transactionRepository.findByRazorpayOrderId(entity.order_id);
    if (!transaction) return;

    await transactionRepository.updateByOrderId(entity.order_id, {
      status: 'FAILED',
      failureReason: entity.error_description || 'Payment failed'
    });

    if (transaction.subscriptionId) {
      const sub = await subscriptionRepository.findById(transaction.subscriptionId);
      if (sub && sub.status === 'ACTIVE') {
        await subscriptionService.transition(sub.id, 'PAST_DUE', { details: { via: 'webhook', event: 'payment_failed' } });
      }
    }

    await auditService.logEvent({
      actorId: transaction.userId,
      action: 'PAYMENT_FAILED',
      targetType: 'PAYMENT_TRANSACTION',
      targetId: transaction.id,
      details: { razorpayOrderId: entity.order_id, reason: entity.error_description }
    });
  }

  private async handleSubscriptionActivatedOrCharged(payload: any): Promise<void> {
    const entity = payload?.payload?.subscription?.entity;
    if (!entity?.id) return;

    const sub = await subscriptionRepository.findByRazorpaySubscriptionId(entity.id);
    if (!sub) return;

    if (sub.status !== 'ACTIVE') {
      await subscriptionService.transition(sub.id, 'ACTIVE', { details: { via: 'webhook', event: 'subscription_activated_or_charged' } });
    }

    await subscriptionRepository.update(sub.id, {
      currentPeriodStart: unixToDate(entity.current_start) ?? sub.currentPeriodStart,
      currentPeriodEnd: unixToDate(entity.current_end) ?? sub.currentPeriodEnd
    });
  }

  private async handleSubscriptionEnded(payload: any): Promise<void> {
    const entity = payload?.payload?.subscription?.entity;
    if (!entity?.id) return;

    const sub = await subscriptionRepository.findByRazorpaySubscriptionId(entity.id);
    if (!sub) return;
    if (sub.status === 'CANCELED') return;

    await subscriptionService.transition(sub.id, 'CANCELED', { details: { via: 'webhook', razorpaySubscriptionId: entity.id } });
  }
}

export const razorpayWebhookService = new RazorpayWebhookService();
