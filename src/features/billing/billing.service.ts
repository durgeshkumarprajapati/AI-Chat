import { configService } from '@/features/config';
import { planService } from './plan.service';
import { subscriptionService } from './subscription.service';
import { subscriptionRepository } from './repositories/subscription.repository';
import { transactionRepository } from './repositories/transaction.repository';
import { razorpayProvider } from './providers/razorpay.provider';
import { ConfigurationError, ConflictError, NotFoundError } from '@/errors';
import { CheckoutRequest, CheckoutResult, SubscriptionDTO } from './billing.types';
import { env } from '@/config/env';

/**
 * The single entry point API routes use to initiate/cancel/reactivate billing actions. Keeps
 * BILLING_ENABLED/RAZORPAY_ENABLED gate checks in one place so no route can accidentally reach
 * a live Razorpay call while either flag is off.
 */
export class BillingService {
  public async initiateCheckout(input: CheckoutRequest): Promise<CheckoutResult> {
    const billingEnabled = await configService.getBoolean('BILLING_ENABLED', false);
    if (!billingEnabled) {
      throw new ConflictError('Billing is not currently enabled. All features remain available on your current plan.');
    }

    const plan = await planService.getPlanByCode(input.planCode);
    const amountCents = input.billingInterval === 'YEARLY' ? plan.yearlyPriceCents : plan.monthlyPriceCents;

    // FREE (or any zero-price plan/interval) never touches Razorpay — a plain plan switch.
    if (amountCents === 0) {
      const subscription = await subscriptionService.getOrCreateForUser(input.userId);
      const freePlanRow = await planService.getPlanByCode(input.planCode);
      await subscriptionRepository.update(subscription.id, { planId: freePlanRow.id, billingInterval: input.billingInterval, status: 'ACTIVE' });
      return { amountCents: 0, currency: plan.currency, billingEnabled: true };
    }

    const razorpayEnabled = await configService.getBoolean('RAZORPAY_ENABLED', false);
    if (!razorpayEnabled) {
      throw new ConfigurationError('Razorpay is not enabled. Contact an administrator to complete billing setup.');
    }
    if (!razorpayProvider.isConfigured()) {
      throw new ConfigurationError('Razorpay credentials are not configured.');
    }

    const subscription = await subscriptionService.getOrCreateForUser(input.userId);
    const order = await razorpayProvider.createOrder({
      amountCents,
      currency: plan.currency,
      receipt: `sub_${subscription.id}_${Date.now()}`,
      notes: { userId: input.userId, planCode: input.planCode, billingInterval: input.billingInterval }
    });

    await transactionRepository.create({
      userId: input.userId,
      subscriptionId: subscription.id,
      status: 'CREATED',
      amountCents: order.amountCents,
      currency: order.currency,
      razorpayOrderId: order.providerOrderId
    });

    return {
      razorpayOrderId: order.providerOrderId,
      razorpayKeyId: env.server?.RAZORPAY_KEY_ID || process.env.RAZORPAY_KEY_ID,
      amountCents: order.amountCents,
      currency: order.currency,
      billingEnabled: true
    };
  }

  public async cancelSubscription(userId: string, opts: { immediate?: boolean } = {}): Promise<SubscriptionDTO> {
    const sub = await subscriptionRepository.findByUserId(userId);
    if (!sub) throw new NotFoundError('Subscription');

    if (sub.razorpaySubscriptionId) {
      try {
        const razorpayEnabled = await configService.getBoolean('RAZORPAY_ENABLED', false);
        if (razorpayEnabled && razorpayProvider.isConfigured()) {
          await razorpayProvider.cancelSubscription({
            providerSubscriptionId: sub.razorpaySubscriptionId,
            cancelAtCycleEnd: !opts.immediate
          });
        }
      } catch (err) {
        // Provider-side cancellation is best-effort; our own state is the source of truth for
        // access control, and the worker reconciliation pass catches any drift.
        console.warn('[BillingService] Razorpay cancelSubscription failed (continuing with local cancellation):', err);
      }
    }

    return subscriptionService.cancel(userId, opts);
  }

  public async reactivateSubscription(userId: string): Promise<SubscriptionDTO> {
    return subscriptionService.reactivate(userId);
  }
}

export const billingService = new BillingService();
