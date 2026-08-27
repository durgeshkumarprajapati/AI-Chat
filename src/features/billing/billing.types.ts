import {
  PlanCode,
  BillingInterval,
  SubscriptionStatus,
  PaymentStatus,
  FeatureCode,
  UsageMetric,
  UsagePeriod,
  WebhookProcessingStatus
} from '@prisma/client';

export interface PlanFeatureDTO {
  featureCode: FeatureCode;
  isEnabled: boolean;
}

export interface PlanLimitDTO {
  metric: UsageMetric;
  limit: number | null;
  isUnlimited: boolean;
  period: UsagePeriod;
}

export interface PlanDTO {
  id: string;
  code: PlanCode;
  name: string;
  description: string | null;
  isActive: boolean;
  monthlyPriceCents: number;
  yearlyPriceCents: number;
  currency: string;
  trialDays: number;
  sortOrder: number;
  features: PlanFeatureDTO[];
  limits: PlanLimitDTO[];
}

export interface SubscriptionDTO {
  id: string;
  userId: string;
  planId: string;
  planCode: PlanCode;
  status: SubscriptionStatus;
  billingInterval: BillingInterval;
  trialStartedAt: Date | null;
  trialEndsAt: Date | null;
  hasUsedTrial: boolean;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  gracePeriodEndsAt: Date | null;
  cancelAtPeriodEnd: boolean;
  canceledAt: Date | null;
  razorpaySubscriptionId: string | null;
  isGrandfathered: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface EntitlementSnapshot {
  userId: string;
  planCode: PlanCode;
  status: SubscriptionStatus;
  billingBypassed: boolean; // true whenever BILLING_ENABLED=false — every feature resolves allowed
  features: Record<string, boolean>;
  computedAt: string;
}

export interface UsageCheckResult {
  allowed: boolean;
  metric: UsageMetric;
  period: UsagePeriod;
  currentCount: number;
  limit: number | null;
  isUnlimited: boolean;
  enforced: boolean; // false when BILLING_USAGE_ENFORCEMENT_ENABLED=false (recorded, never denied)
}

export interface TransactionDTO {
  id: string;
  userId: string;
  subscriptionId: string | null;
  status: PaymentStatus;
  amountCents: number;
  currency: string;
  razorpayOrderId: string | null;
  razorpayPaymentId: string | null;
  createdAt: Date;
}

export interface WebhookEventDTO {
  id: string;
  eventId: string;
  eventType: string;
  status: WebhookProcessingStatus;
  receivedAt: Date;
  processedAt: Date | null;
}

export interface CheckoutRequest {
  userId: string;
  planCode: PlanCode;
  billingInterval: BillingInterval;
}

export interface CheckoutResult {
  razorpayOrderId?: string;
  razorpaySubscriptionId?: string;
  razorpayKeyId?: string;
  amountCents: number;
  currency: string;
  billingEnabled: boolean;
}
