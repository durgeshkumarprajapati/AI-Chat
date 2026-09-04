'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';

interface Subscription {
  id: string;
  planCode: 'FREE' | 'PRO' | 'PREMIUM';
  status: string;
  billingInterval: 'MONTHLY' | 'YEARLY';
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}

interface UsageRow {
  metric: string;
  period: string;
  limit: number | null;
  isUnlimited: boolean;
  currentCount: number;
}

interface Transaction {
  id: string;
  status: string;
  amountCents: number;
  currency: string;
  createdAt: string;
}

// Phase 77A: replaced a hardcoded hex map driving an inline `style` prop (fixed colors,
// invisible in light mode) with semantic Tailwind classes from the centralized token system.
const STATUS_BADGE_CLASSES: Record<string, string> = {
  ACTIVE: 'text-success border-success/40',
  TRIALING: 'text-primary border-primary/40',
  PAST_DUE: 'text-warning border-warning/40',
  GRACE_PERIOD: 'text-warning border-warning/40',
  CANCEL_SCHEDULED: 'text-warning border-warning/40',
  CANCELED: 'text-muted-foreground border-border',
  EXPIRED: 'text-muted-foreground border-border',
  SUSPENDED: 'text-destructive border-destructive/40',
  INCOMPLETE: 'text-muted-foreground border-border'
};

const METRIC_LABELS: Record<string, string> = {
  RAG_QUERIES: 'RAG Queries',
  DOCUMENTS: 'Documents',
  STORAGE_MB: 'Storage (MB)',
  GROUP_MEMBERS: 'Group Members',
  PROJECTS: 'Projects',
  MEETING_ANALYSES: 'Meeting Analyses',
  AI_REQUESTS: 'AI Requests'
};

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const diff = new Date(dateStr).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

export default function BillingPage() {
  const [billingEnabled, setBillingEnabled] = useState(false);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [usage, setUsage] = useState<UsageRow[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const load = async () => {
    try {
      const [subRes, usageRes, txRes] = await Promise.all([
        fetch('/api/billing/subscription').then((r) => r.json()),
        fetch('/api/billing/usage').then((r) => r.json()),
        fetch('/api/billing/transactions').then((r) => r.json()).catch(() => ({ success: false }))
      ]);
      if (subRes.success) {
        setBillingEnabled(subRes.data.billingEnabled);
        setSubscription(subRes.data.subscription);
      }
      if (usageRes.success) setUsage(usageRes.data.usage);
      if (txRes.success) setTransactions(txRes.data.items || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleCancel = async () => {
    setBusy(true);
    setActionMsg(null);
    try {
      const res = await fetch('/api/billing/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ immediate: false })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error?.message || 'Cancellation failed');
      setActionMsg('Your subscription will end at the close of the current billing period.');
      setConfirmCancel(false);
      await load();
    } catch (err: any) {
      setActionMsg(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleReactivate = async () => {
    setBusy(true);
    setActionMsg(null);
    try {
      const res = await fetch('/api/billing/reactivate', { method: 'POST' });
      const data = await res.json();
      if (!data.success) throw new Error(data.error?.message || 'Reactivation failed');
      setActionMsg('Subscription reactivated.');
      await load();
    } catch (err: any) {
      setActionMsg(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background px-4 py-10">
        <div className="mx-auto max-w-4xl space-y-4">
          <div className="h-40 rounded-2xl border border-border bg-muted animate-pulse" />
          <div className="h-64 rounded-2xl border border-border bg-muted animate-pulse" />
        </div>
      </div>
    );
  }

  if (!billingEnabled) {
    return (
      <div className="min-h-screen bg-background px-4 py-16">
        <div className="mx-auto max-w-xl text-center space-y-4 rounded-2xl border border-border bg-card p-8 shadow-2xl">
          <span className="text-3xl">💳</span>
          <h1 className="text-xl font-extrabold text-foreground font-sans">Billing is not yet enabled</h1>
          <p className="text-sm text-muted-foreground">
            This workspace has not turned on subscription billing yet. Every feature is currently available to you at
            no charge.
          </p>
          <Link
            href="/pricing"
            className="inline-block px-5 py-2 rounded-xl bg-gradient-to-r from-primary to-primary-hover text-primary-foreground text-xs font-extrabold shadow-md hover:opacity-90"
          >
            View Plans
          </Link>
        </div>
      </div>
    );
  }

  const trialDaysLeft = subscription?.status === 'TRIALING' ? daysUntil(subscription.trialEndsAt) : null;

  return (
    <div className="min-h-screen bg-background px-4 py-10 sm:px-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <h1 className="text-2xl font-extrabold text-foreground font-sans">Billing & Plan</h1>

        {actionMsg && (
          <div className="rounded-xl border border-primary/30 bg-primary/10 px-4 py-3 text-sm text-primary">{actionMsg}</div>
        )}

        <div className="bg-card border border-border rounded-2xl p-6 shadow-2xl space-y-4">
          <div className="flex items-center justify-between border-b border-border/60 pb-3">
            <h3 className="text-sm font-extrabold text-foreground font-sans">Current Plan</h3>
            <span
              className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-md border ${STATUS_BADGE_CLASSES[subscription?.status || ''] || 'text-muted-foreground border-border'}`}
            >
              ● {subscription?.status}
            </span>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h4 className="text-lg font-extrabold text-foreground font-sans">{subscription?.planCode}</h4>
              {trialDaysLeft !== null && (
                <p className="text-xs text-success font-mono mt-1">{trialDaysLeft} day(s) left in your trial</p>
              )}
              {subscription?.currentPeriodEnd && (
                <p className="text-xs text-muted-foreground font-mono mt-1">
                  {subscription.cancelAtPeriodEnd ? 'Access ends' : 'Renews'} on{' '}
                  {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/pricing"
                className="h-10 px-4 flex items-center bg-gradient-to-r from-primary to-primary-hover text-primary-foreground text-xs font-extrabold rounded-xl shadow-md hover:opacity-90"
              >
                Upgrade / Change Plan
              </Link>
              {subscription?.cancelAtPeriodEnd ? (
                <button
                  onClick={handleReactivate}
                  disabled={busy}
                  className="h-10 px-4 bg-surface hover:bg-surface-hover border border-border text-foreground text-xs font-bold rounded-xl transition disabled:opacity-60"
                >
                  Reactivate
                </button>
              ) : (
                subscription?.planCode !== 'FREE' && (
                  <button
                    onClick={() => setConfirmCancel(true)}
                    disabled={busy}
                    className="h-10 px-4 bg-surface hover:bg-surface-hover border border-border text-foreground text-xs font-bold rounded-xl transition disabled:opacity-60"
                  >
                    Cancel
                  </button>
                )
              )}
            </div>
          </div>
        </div>

        <div className="bg-card border border-border rounded-2xl p-6 shadow-2xl space-y-4">
          <h3 className="text-sm font-extrabold text-foreground font-sans border-b border-border/60 pb-3">Usage & Limits</h3>
          <div className="space-y-3">
            {usage.map((u) => {
              const pct = u.isUnlimited || !u.limit ? 0 : Math.min(100, Math.round((u.currentCount / u.limit) * 100));
              return (
                <div key={u.metric} className="space-y-1">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-muted-foreground font-medium">{METRIC_LABELS[u.metric] || u.metric}</span>
                    <span className="text-primary font-mono font-bold">
                      {u.isUnlimited ? `${u.currentCount} · Unlimited` : `${u.currentCount} / ${u.limit ?? 0}`}
                    </span>
                  </div>
                  {!u.isUnlimited && (
                    <div className="h-2 w-full bg-surface border border-border/60 rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-primary to-primary-hover rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  )}
                </div>
              );
            })}
            {usage.length === 0 && <p className="text-xs text-muted-foreground">No usage limits configured for this plan.</p>}
          </div>
        </div>

        <div className="bg-card border border-border rounded-2xl p-6 shadow-2xl space-y-4">
          <h3 className="text-sm font-extrabold text-foreground font-sans border-b border-border/60 pb-3">Billing History</h3>
          {transactions.length === 0 ? (
            <p className="text-xs text-muted-foreground">No transactions yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-muted-foreground font-mono uppercase text-[10px]">
                    <th className="py-2">Date</th>
                    <th className="py-2">Amount</th>
                    <th className="py-2">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {transactions.map((tx) => (
                    <tr key={tx.id}>
                      <td className="py-2 text-muted-foreground">{new Date(tx.createdAt).toLocaleDateString()}</td>
                      <td className="py-2 text-foreground font-mono">
                        {tx.currency === 'INR' ? '₹' : tx.currency + ' '}
                        {(tx.amountCents / 100).toLocaleString()}
                      </td>
                      <td className="py-2 text-primary font-mono">{tx.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {confirmCancel && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center px-4">
          <div className="bg-background border border-border rounded-2xl p-6 max-w-sm w-full space-y-4 shadow-2xl">
            <h3 className="text-sm font-extrabold text-foreground">Cancel subscription?</h3>
            <p className="text-xs text-muted-foreground">
              You will keep access until the end of the current billing period, then move to the Free plan.
            </p>
            <div className="flex space-x-3">
              <button
                onClick={() => setConfirmCancel(false)}
                className="flex-1 h-10 bg-surface border border-border text-foreground text-xs font-bold rounded-xl"
              >
                Keep Subscription
              </button>
              <button
                onClick={handleCancel}
                disabled={busy}
                className="flex-1 h-10 bg-destructive text-white text-xs font-extrabold rounded-xl disabled:opacity-60"
              >
                {busy ? 'Cancelling…' : 'Confirm Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
