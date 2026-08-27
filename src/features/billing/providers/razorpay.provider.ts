import Razorpay from 'razorpay';
import { env } from '@/config/env';
import { ConfigurationError, InfrastructureError } from '@/errors';
import {
  BillingProvider,
  CreateOrderInput,
  CreateOrderResult,
  CreateSubscriptionInput,
  CreateSubscriptionResult,
  CancelSubscriptionInput
} from './billing-provider.interface';

/**
 * Real Razorpay SDK integration — production-ready, but never invoked unless
 * BILLING_ENABLED and RAZORPAY_ENABLED (both Config-registry flags, default false) are true
 * AND RAZORPAY_KEY_ID/RAZORPAY_KEY_SECRET are set. billing.service.ts checks both flags before
 * ever constructing/calling this provider, so shipping this class carries no default-on risk.
 */
export class RazorpayProvider implements BillingProvider {
  public readonly name = 'razorpay';
  private client: Razorpay | null = null;

  private getClient(): Razorpay {
    const keyId = env.server?.RAZORPAY_KEY_ID || process.env.RAZORPAY_KEY_ID;
    const keySecret = env.server?.RAZORPAY_KEY_SECRET || process.env.RAZORPAY_KEY_SECRET;
    if (!keyId || !keySecret) {
      throw new ConfigurationError('Razorpay is not configured: RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET are missing.');
    }
    if (!this.client) {
      this.client = new Razorpay({ key_id: keyId, key_secret: keySecret });
    }
    return this.client;
  }

  public isConfigured(): boolean {
    const keyId = env.server?.RAZORPAY_KEY_ID || process.env.RAZORPAY_KEY_ID;
    const keySecret = env.server?.RAZORPAY_KEY_SECRET || process.env.RAZORPAY_KEY_SECRET;
    return Boolean(keyId && keySecret);
  }

  public async createOrder(input: CreateOrderInput): Promise<CreateOrderResult> {
    const client = this.getClient();
    try {
      const order = await client.orders.create({
        amount: input.amountCents,
        currency: input.currency,
        receipt: input.receipt,
        notes: input.notes
      });
      return { providerOrderId: order.id, amountCents: Number(order.amount), currency: order.currency };
    } catch (err) {
      throw new InfrastructureError('Razorpay', err instanceof Error ? err.message : String(err));
    }
  }

  public async createSubscription(input: CreateSubscriptionInput): Promise<CreateSubscriptionResult> {
    const client = this.getClient();
    try {
      const subscription = await client.subscriptions.create({
        plan_id: input.providerPlanId,
        customer_notify: input.customerNotify ? 1 : 0,
        total_count: input.totalCount ?? 120,
        notes: input.notes
      });
      return { providerSubscriptionId: subscription.id };
    } catch (err) {
      throw new InfrastructureError('Razorpay', err instanceof Error ? err.message : String(err));
    }
  }

  public async cancelSubscription(input: CancelSubscriptionInput): Promise<void> {
    const client = this.getClient();
    try {
      await client.subscriptions.cancel(input.providerSubscriptionId, input.cancelAtCycleEnd ?? false);
    } catch (err) {
      throw new InfrastructureError('Razorpay', err instanceof Error ? err.message : String(err));
    }
  }
}

export const razorpayProvider = new RazorpayProvider();
