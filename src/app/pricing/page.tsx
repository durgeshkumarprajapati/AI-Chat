'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

interface PlanFeature {
  featureCode: string;
  isEnabled: boolean;
}

interface Plan {
  id: string;
  code: 'FREE' | 'PRO' | 'PREMIUM';
  name: string;
  description: string | null;
  monthlyPriceCents: number;
  yearlyPriceCents: number;
  currency: string;
  trialDays: number;
  features: PlanFeature[];
}

const FEATURE_LABELS: Record<string, string> = {
  PRIVATE_RAG_CHAT: 'Private RAG Chat',
  GROUP_RAG_CHAT: 'Group RAG Chat',
  PROJECT_RAG_WORKSPACE: 'Project Workspaces',
  ADVANCED_RAG: 'Advanced Adaptive Retrieval',
  GRAPH_RAG: 'Graph-Augmented Retrieval',
  MULTIMODAL_DOCUMENT_INTELLIGENCE: 'Multimodal Document Intelligence',
  OCR_PROCESSING: 'OCR Processing',
  TABLE_EXTRACTION: 'Table Extraction',
  IMAGE_ANALYSIS: 'Image Analysis',
  CHART_ANALYSIS: 'Chart Analysis',
  DOCUMENT_VERSIONING: 'Document Versioning',
  DOCUMENT_LIFECYCLE: 'Document Lifecycle Management',
  MEETING_INTELLIGENCE: 'Meeting Intelligence',
  CLICKUP_INTEGRATION: 'ClickUp Integration',
  WEB_SEARCH: 'Web Search & Discovery',
  KNOWLEDGE_GRAPH: 'Knowledge Graph',
  SYSTEM_ARCHITECTURE_EXPLORER: 'System Architecture Explorer'
};

function formatPrice(cents: number, currency: string): string {
  if (cents === 0) return 'Free';
  return `${currency === 'INR' ? '₹' : currency + ' '}${(cents / 100).toLocaleString()}`;
}

export default function PricingPage() {
  const router = useRouter();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [billingEnabled, setBillingEnabled] = useState(false);
  const [currentPlanCode, setCurrentPlanCode] = useState<string | null>(null);
  const [interval, setInterval] = useState<'MONTHLY' | 'YEARLY'>('MONTHLY');
  const [loading, setLoading] = useState(true);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [busyPlan, setBusyPlan] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [plansRes, subRes] = await Promise.all([
          fetch('/api/billing/plans').then((r) => r.json()),
          fetch('/api/billing/subscription').then((r) => r.json())
        ]);
        if (plansRes.success) setPlans(plansRes.data.plans);
        if (subRes.success) {
          setBillingEnabled(subRes.data.billingEnabled);
          setCurrentPlanCode(subRes.data.subscription?.planCode ?? null);
        }
      } catch {
        // best-effort — page still renders plan cards without current-plan context
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const handleSelectPlan = async (plan: Plan) => {
    if (!billingEnabled) {
      setActionMsg('Billing is not yet enabled on this workspace — every feature is currently available at no charge.');
      return;
    }
    setBusyPlan(plan.code);
    setActionMsg(null);
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planCode: plan.code, billingInterval: interval })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error?.message || 'Checkout failed');
      if (data.data.razorpayOrderId) {
        setActionMsg('Checkout order created. Razorpay payment UI would open here.');
      } else {
        setActionMsg(`You are now on the ${plan.name} plan.`);
        router.refresh();
      }
    } catch (err: any) {
      setActionMsg(err.message || 'Something went wrong.');
    } finally {
      setBusyPlan(null);
    }
  };

  return (
    <div className="min-h-screen bg-background px-4 py-10 sm:px-8">
      <div className="mx-auto max-w-6xl space-y-10">
        <div className="text-center space-y-3">
          <h1 className="text-3xl sm:text-4xl font-extrabold text-foreground font-sans">Plans & Pricing</h1>
          <p className="text-sm text-muted-foreground max-w-2xl mx-auto">
            Choose the plan that fits your team. Every plan includes access to the core platform — upgrade for
            collaboration, multimodal intelligence, and higher usage limits.
          </p>
        </div>

        {!billingEnabled && (
          <div className="mx-auto max-w-2xl rounded-xl border border-success/30 bg-success/10 px-4 py-3 text-center text-sm font-mono text-success">
            Billing is not yet enabled for this workspace — every feature listed below is currently available to all
            users at no charge.
          </div>
        )}

        {actionMsg && (
          <div className="mx-auto max-w-2xl rounded-xl border border-primary/30 bg-primary/10 px-4 py-3 text-center text-sm text-primary">
            {actionMsg}
          </div>
        )}

        <div className="flex justify-center">
          <div className="inline-flex rounded-xl border border-border bg-surface p-1">
            {(['MONTHLY', 'YEARLY'] as const).map((opt) => (
              <button
                key={opt}
                onClick={() => setInterval(opt)}
                className={`px-4 py-1.5 text-xs font-bold rounded-lg transition font-mono ${
                  interval === opt ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {opt === 'MONTHLY' ? 'Monthly' : 'Yearly (save ~17%)'}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-96 rounded-2xl border border-border bg-muted animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch">
            {plans.map((plan) => {
              const isCurrent = currentPlanCode === plan.code;
              const isRecommended = plan.code === 'PRO';
              const price = interval === 'YEARLY' ? plan.yearlyPriceCents : plan.monthlyPriceCents;
              const enabledFeatures = plan.features.filter((f) => f.isEnabled);

              return (
                <div
                  key={plan.id}
                  className={`relative flex flex-col rounded-2xl border p-6 shadow-2xl space-y-5 ${
                    isRecommended ? 'border-primary bg-gradient-to-b from-surface-hover to-background' : 'border-border bg-card'
                  }`}
                >
                  {isRecommended && (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-[10px] font-mono font-bold bg-primary text-primary-foreground px-3 py-1 rounded-full">
                      RECOMMENDED
                    </span>
                  )}
                  <div>
                    <h3 className="text-lg font-extrabold text-foreground font-sans">{plan.name}</h3>
                    <p className="text-xs text-muted-foreground mt-1 min-h-[32px]">{plan.description}</p>
                  </div>
                  <div>
                    <span className="text-3xl font-extrabold text-foreground font-mono">{formatPrice(price, plan.currency)}</span>
                    {price > 0 && <span className="text-xs text-muted-foreground font-mono">/{interval === 'YEARLY' ? 'year' : 'month'}</span>}
                  </div>
                  {plan.trialDays > 0 && (
                    <span className="text-[10px] font-mono text-success bg-success/10 px-2 py-1 rounded-md border border-success/30 w-fit">
                      {plan.trialDays}-day free trial
                    </span>
                  )}
                  <ul className="space-y-2 text-xs text-muted-foreground flex-1">
                    {enabledFeatures.slice(0, 8).map((f) => (
                      <li key={f.featureCode} className="flex items-start space-x-2">
                        <span className="text-success mt-0.5">✓</span>
                        <span>{FEATURE_LABELS[f.featureCode] || f.featureCode}</span>
                      </li>
                    ))}
                    {enabledFeatures.length > 8 && (
                      <li className="text-muted-foreground">+{enabledFeatures.length - 8} more capabilities</li>
                    )}
                  </ul>
                  <button
                    type="button"
                    disabled={isCurrent || busyPlan === plan.code}
                    onClick={() => handleSelectPlan(plan)}
                    className={`h-10 rounded-xl text-xs font-extrabold transition shadow-md disabled:opacity-60 ${
                      isCurrent
                        ? 'bg-surface border border-border text-muted-foreground cursor-default'
                        : 'bg-gradient-to-r from-primary to-primary-hover text-primary-foreground hover:opacity-90'
                    }`}
                  >
                    {isCurrent ? 'Current Plan' : busyPlan === plan.code ? 'Please wait…' : billingEnabled ? `Choose ${plan.name}` : 'Available now'}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
