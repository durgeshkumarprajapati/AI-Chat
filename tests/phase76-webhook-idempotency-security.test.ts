jest.mock('razorpay', () => {
  class MockRazorpay {
    static validateWebhookSignature = jest.fn();
  }
  return MockRazorpay;
});
jest.mock('@/features/billing/repositories/webhook-event.repository', () => ({
  webhookEventRepository: { recordIfNew: jest.fn(), markProcessed: jest.fn() }
}));
jest.mock('@/features/billing/repositories/transaction.repository', () => ({
  transactionRepository: { findByRazorpayOrderId: jest.fn(), updateByOrderId: jest.fn() }
}));
jest.mock('@/features/billing/repositories/subscription.repository', () => ({
  subscriptionRepository: { findById: jest.fn(), findByRazorpaySubscriptionId: jest.fn(), update: jest.fn() }
}));
jest.mock('@/features/billing/subscription.service', () => ({
  subscriptionService: { transition: jest.fn() }
}));
jest.mock('@/features/audit/audit.service', () => ({
  auditService: { logEvent: jest.fn() }
}));

import Razorpay from 'razorpay';
import { webhookEventRepository } from '@/features/billing/repositories/webhook-event.repository';
import { transactionRepository } from '@/features/billing/repositories/transaction.repository';
import { razorpayWebhookService } from '@/features/billing/webhook/razorpay-webhook.service';

const PAYLOAD = JSON.stringify({
  event: 'payment.captured',
  payload: { payment: { entity: { id: 'pay_1', order_id: 'order_1' } } }
});

describe('Phase 76 — Razorpay webhook signature verification and idempotency', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.RAZORPAY_WEBHOOK_SECRET = 'test-webhook-secret';
  });

  it('rejects a delivery with an invalid signature without recording or processing it', async () => {
    (Razorpay.validateWebhookSignature as jest.Mock).mockReturnValue(false);

    const result = await razorpayWebhookService.process(PAYLOAD, 'bad-signature', 'evt_1');

    expect(result.status).toBe('REJECTED');
    expect(webhookEventRepository.recordIfNew).not.toHaveBeenCalled();
  });

  it('rejects when no signature header is present at all', async () => {
    (Razorpay.validateWebhookSignature as jest.Mock).mockReturnValue(false);

    const result = await razorpayWebhookService.process(PAYLOAD, null, 'evt_1');

    expect(result.status).toBe('REJECTED');
  });

  it('processes a valid, first-time delivery exactly once', async () => {
    (Razorpay.validateWebhookSignature as jest.Mock).mockReturnValue(true);
    (webhookEventRepository.recordIfNew as jest.Mock).mockResolvedValue({ id: 'wh-1', eventId: 'evt_1' });
    (transactionRepository.findByRazorpayOrderId as jest.Mock).mockResolvedValue(null);

    const result = await razorpayWebhookService.process(PAYLOAD, 'valid-signature', 'evt_1');

    expect(result.status).toBe('PROCESSED');
    expect(webhookEventRepository.recordIfNew).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: 'evt_1', eventType: 'payment.captured', signatureVerified: true })
    );
    expect(webhookEventRepository.markProcessed).toHaveBeenCalledWith('evt_1', 'PROCESSED');
  });

  it('a duplicate delivery of the same eventId is ignored and never reprocessed', async () => {
    (Razorpay.validateWebhookSignature as jest.Mock).mockReturnValue(true);
    // recordIfNew returns null on the second call — the real repository's idempotency contract.
    (webhookEventRepository.recordIfNew as jest.Mock).mockResolvedValue(null);

    const result = await razorpayWebhookService.process(PAYLOAD, 'valid-signature', 'evt_1');

    expect(result.status).toBe('IGNORED');
    expect(result.reason).toMatch(/Duplicate/);
    expect(transactionRepository.findByRazorpayOrderId).not.toHaveBeenCalled();
    expect(webhookEventRepository.markProcessed).not.toHaveBeenCalled();
  });

  it('two concurrent deliveries of the same event both call recordIfNew, but only one proceeds to dispatch', async () => {
    (Razorpay.validateWebhookSignature as jest.Mock).mockReturnValue(true);
    (webhookEventRepository.recordIfNew as jest.Mock)
      .mockResolvedValueOnce({ id: 'wh-1', eventId: 'evt_1' })
      .mockResolvedValueOnce(null);
    (transactionRepository.findByRazorpayOrderId as jest.Mock).mockResolvedValue(null);

    const [first, second] = await Promise.all([
      razorpayWebhookService.process(PAYLOAD, 'valid-signature', 'evt_1'),
      razorpayWebhookService.process(PAYLOAD, 'valid-signature', 'evt_1')
    ]);

    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual(['IGNORED', 'PROCESSED']);
  });
});
