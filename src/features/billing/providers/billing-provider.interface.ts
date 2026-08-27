export interface CreateOrderInput {
  amountCents: number;
  currency: string;
  receipt: string;
  notes?: Record<string, string>;
}

export interface CreateOrderResult {
  providerOrderId: string;
  amountCents: number;
  currency: string;
}

export interface CreateSubscriptionInput {
  providerPlanId: string;
  customerNotify?: boolean;
  totalCount?: number;
  notes?: Record<string, string>;
}

export interface CreateSubscriptionResult {
  providerSubscriptionId: string;
}

export interface CancelSubscriptionInput {
  providerSubscriptionId: string;
  cancelAtCycleEnd?: boolean;
}

/** Provider abstraction so a second payment gateway could be added without touching billing.service.ts. */
export interface BillingProvider {
  readonly name: string;
  isConfigured(): boolean;
  createOrder(_input: CreateOrderInput): Promise<CreateOrderResult>;
  createSubscription(_input: CreateSubscriptionInput): Promise<CreateSubscriptionResult>;
  cancelSubscription(_input: CancelSubscriptionInput): Promise<void>;
}
