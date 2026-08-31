'use client';

export const dynamic = 'force-dynamic';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';

const ALL_PLAN_CODES = ['FREE', 'PRO', 'PREMIUM'] as const;
type PlanCode = (typeof ALL_PLAN_CODES)[number];

const INPUT_CLASS =
  'w-full h-9 px-3 rounded-lg text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500';
const LABEL_CLASS = 'block text-[10px] font-mono font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1';

interface Metrics {
  billingIntegration: { billingEnabled: boolean; razorpayEnabled: boolean; razorpayConfigured: boolean };
  totalUsers: number;
  trialUsers: number;
  activeSubscriptions: number;
  pastDueUsers: number;
  canceledOrExpired: number;
  mrrCents: number;
  arrCents: number;
}

interface PlanFeature {
  featureCode: string;
  isEnabled: boolean;
}

interface PlanLimit {
  metric: string;
  limit: number | null;
  isUnlimited: boolean;
  period: string;
}

interface Plan {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  monthlyPriceCents: number;
  yearlyPriceCents: number;
  currency: string;
  features: PlanFeature[];
  limits: PlanLimit[];
}

interface SubscriptionRow {
  id: string;
  userId: string;
  userEmail?: string;
  userName?: string;
  planCode: string;
  status: string;
  billingInterval: string;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  razorpaySubscriptionId: string | null;
}

function formatMoney(cents: number, currency = 'INR'): string {
  return `${currency === 'INR' ? '₹' : currency + ' '}${(cents / 100).toLocaleString()}`;
}

export default function AdminBillingPage() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [subscriptions, setSubscriptions] = useState<SubscriptionRow[]>([]);
  const [subTotal, setSubTotal] = useState(0);
  const [subPage, setSubPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingPlanId, setSavingPlanId] = useState<string | null>(null);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [newPlan, setNewPlan] = useState({
    code: '' as PlanCode | '',
    name: '',
    description: '',
    currency: 'INR',
    monthlyPrice: '',
    yearlyPrice: '',
    trialDays: '0'
  });

  const availablePlanCodes = ALL_PLAN_CODES.filter((code) => !plans.some((p) => p.code === code));

  const resetCreateForm = () => {
    setNewPlan({ code: '', name: '', description: '', currency: 'INR', monthlyPrice: '', yearlyPrice: '', trialDays: '0' });
    setCreateError(null);
  };

  const loadSubscriptions = async (page: number) => {
    const res = await fetch(`/api/admin/billing/subscriptions?page=${page}&pageSize=20`).then((r) => r.json());
    if (res.success) {
      setSubscriptions(res.data.subscriptions);
      setSubTotal(res.data.total);
      setSubPage(page);
    }
  };

  useEffect(() => {
    async function load() {
      try {
        // Phase 77: the initial subscriptions page never depended on metrics/plans resolving
        // first — folded into the same Promise.all instead of a separate request issued only
        // after those two settled.
        const [metricsRes, plansRes, subsRes] = await Promise.all([
          fetch('/api/admin/billing/metrics').then((r) => r.json()),
          fetch('/api/admin/billing/plans').then((r) => r.json()),
          fetch('/api/admin/billing/subscriptions?page=1&pageSize=20').then((r) => r.json())
        ]);
        if (!metricsRes.success) throw new Error(metricsRes.error?.message || 'Access denied');
        setMetrics(metricsRes.data);
        if (plansRes.success) setPlans(plansRes.data.plans);
        if (subsRes.success) {
          setSubscriptions(subsRes.data.subscriptions);
          setSubTotal(subsRes.data.total);
          setSubPage(1);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Admin access required.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const togglePlanActive = async (plan: Plan) => {
    setSavingPlanId(plan.id);
    try {
      const res = await fetch(`/api/admin/billing/plans/${plan.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !plan.isActive })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error?.message || 'Update failed');
      setPlans((prev) => prev.map((p) => (p.id === plan.id ? { ...p, isActive: !p.isActive } : p)));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update plan');
    } finally {
      setSavingPlanId(null);
    }
  };

  const handleCreatePlan = async () => {
    setCreateError(null);

    if (!newPlan.code) {
      setCreateError('Select a plan code.');
      return;
    }
    if (!newPlan.name.trim()) {
      setCreateError('Plan name is required.');
      return;
    }
    const monthlyPriceCents = Math.round(parseFloat(newPlan.monthlyPrice || '0') * 100);
    const yearlyPriceCents = Math.round(parseFloat(newPlan.yearlyPrice || '0') * 100);
    if (Number.isNaN(monthlyPriceCents) || Number.isNaN(yearlyPriceCents) || monthlyPriceCents < 0 || yearlyPriceCents < 0) {
      setCreateError('Monthly and yearly price must be valid, non-negative numbers.');
      return;
    }

    setCreating(true);
    try {
      const res = await fetch('/api/admin/billing/plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: newPlan.code,
          name: newPlan.name.trim(),
          description: newPlan.description.trim() || undefined,
          currency: newPlan.currency,
          monthlyPriceCents,
          yearlyPriceCents,
          trialDays: parseInt(newPlan.trialDays || '0', 10) || 0,
          sortOrder: plans.length
        })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error?.message || 'Failed to create plan');

      setPlans((prev) => [...prev, { ...data.data.plan, features: data.data.plan.features ?? [], limits: data.data.plan.limits ?? [] }]);
      setShowCreateModal(false);
      resetCreateForm();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create plan');
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen p-6 flex items-center justify-center font-sans text-slate-900 dark:text-slate-100">
        <div className="text-xs text-indigo-600 dark:text-indigo-400 font-mono animate-pulse">Loading billing overview…</div>
      </div>
    );
  }

  if (error || !metrics) {
    return (
      <div className="min-h-screen p-6 flex flex-col items-center justify-center font-sans text-slate-900 dark:text-slate-100">
        <div className="bg-rose-50 dark:bg-rose-950/80 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300 p-6 rounded-2xl max-w-md text-center shadow-sm">
          <h2 className="text-lg font-bold mb-2">Access Denied</h2>
          <p className="text-xs mb-4">{error}</p>
          <Link href="/dashboard" className="inline-block py-2 px-4 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-white text-xs rounded-lg font-semibold transition">
            Back to Workspace
          </Link>
        </div>
      </div>
    );
  }

  const integrationOk = metrics.billingIntegration.razorpayEnabled && metrics.billingIntegration.razorpayConfigured;

  return (
    <div className="min-h-screen p-6 sm:p-10 font-sans text-slate-900 dark:text-slate-100">
      <div className="w-full max-w-[1600px] mx-auto space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-2xl font-bold bg-gradient-to-r from-slate-900 via-indigo-800 to-indigo-600 dark:from-white dark:to-indigo-300 bg-clip-text text-transparent">
                Billing & Subscriptions
              </h1>
              <span className="px-2.5 py-0.5 rounded-full bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 text-[10px] font-mono font-bold">
                ADMIN ONLY
              </span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
              Subscription plans, entitlements, and Razorpay integration status.
            </p>
          </div>
          <div
            className={`px-3 py-1.5 rounded-lg text-xs font-mono font-semibold border ${
              integrationOk
                ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                : 'bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800'
            }`}
          >
            Billing Integration ● {integrationOk ? 'Configured' : 'Disabled / Not Configured'}
          </div>
        </div>

        {!metrics.billingIntegration.billingEnabled && (
          <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 px-4 py-3 text-xs font-mono">
            BILLING_ENABLED is currently false — no user is being charged or restricted. Enable it from Manage Configs
            (Billing category) when ready to go live.
          </div>
        )}

        {/* Overview */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          {[
            { label: 'Total Users', value: metrics.totalUsers, color: 'text-slate-900 dark:text-white' },
            { label: 'Trial Users', value: metrics.trialUsers, color: 'text-sky-600 dark:text-sky-400' },
            { label: 'Active Subscriptions', value: metrics.activeSubscriptions, color: 'text-emerald-600 dark:text-emerald-400' },
            { label: 'Past Due', value: metrics.pastDueUsers, color: 'text-amber-600 dark:text-amber-400' },
            { label: 'MRR', value: formatMoney(metrics.mrrCents), color: 'text-indigo-600 dark:text-indigo-400' },
            { label: 'ARR', value: formatMoney(metrics.arrCents), color: 'text-indigo-600 dark:text-indigo-400' }
          ].map((card) => (
            <div key={card.label} className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
              <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">{card.label}</div>
              <div className={`text-xl font-bold mt-1 ${card.color}`}>{card.value}</div>
            </div>
          ))}
        </div>

        {/* Plan Management */}
        <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Plan Management</h3>
            <button
              onClick={() => {
                resetCreateForm();
                setShowCreateModal(true);
              }}
              disabled={availablePlanCodes.length === 0}
              title={availablePlanCodes.length === 0 ? 'All plan codes (FREE, PRO, PREMIUM) already exist' : undefined}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-lg shadow-sm transition-colors disabled:opacity-40 disabled:pointer-events-none"
            >
              + Add Plan
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700 dark:text-slate-300">
              <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-400 uppercase font-mono text-[10px]">
                <tr>
                  <th className="py-3 px-4">Plan</th>
                  <th className="py-3 px-4">Monthly</th>
                  <th className="py-3 px-4">Yearly</th>
                  <th className="py-3 px-4">Enabled Features</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {plans.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-950/40">
                    <td className="py-3 px-4 font-mono font-semibold">{p.name}</td>
                    <td className="py-3 px-4">{formatMoney(p.monthlyPriceCents, p.currency)}</td>
                    <td className="py-3 px-4">{formatMoney(p.yearlyPriceCents, p.currency)}</td>
                    <td className="py-3 px-4">{p.features.filter((f) => f.isEnabled).length} / {p.features.length}</td>
                    <td className="py-3 px-4">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                          p.isActive
                            ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                        }`}
                      >
                        {p.isActive ? 'ACTIVE' : 'INACTIVE'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => togglePlanActive(p)}
                        disabled={savingPlanId === p.id}
                        className="px-3 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-[10px] font-bold rounded-lg disabled:opacity-60"
                      >
                        {p.isActive ? 'Deactivate' : 'Activate'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Subscription Management */}
        <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Subscriptions ({subTotal})</h3>
            <div className="flex items-center space-x-2 text-xs">
              <button
                disabled={subPage <= 1}
                onClick={() => loadSubscriptions(subPage - 1)}
                className="px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded disabled:opacity-40"
              >
                ← Prev
              </button>
              <span className="text-slate-500 dark:text-slate-400 font-mono">Page {subPage}</span>
              <button
                disabled={subPage * 20 >= subTotal}
                onClick={() => loadSubscriptions(subPage + 1)}
                className="px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded disabled:opacity-40"
              >
                Next →
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700 dark:text-slate-300">
              <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-400 uppercase font-mono text-[10px]">
                <tr>
                  <th className="py-3 px-4">User</th>
                  <th className="py-3 px-4">Plan</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Trial Ends</th>
                  <th className="py-3 px-4">Renewal</th>
                  <th className="py-3 px-4">Razorpay Ref</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {subscriptions.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50 dark:hover:bg-slate-950/40">
                    <td className="py-3 px-4 font-mono">{s.userEmail || s.userId}</td>
                    <td className="py-3 px-4">{s.planCode}</td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-100 dark:bg-slate-800">{s.status}</span>
                    </td>
                    <td className="py-3 px-4">{s.trialEndsAt ? new Date(s.trialEndsAt).toLocaleDateString() : '—'}</td>
                    <td className="py-3 px-4">{s.currentPeriodEnd ? new Date(s.currentPeriodEnd).toLocaleDateString() : '—'}</td>
                    <td className="py-3 px-4 font-mono text-[10px] text-slate-500">{s.razorpaySubscriptionId || '—'}</td>
                  </tr>
                ))}
                {subscriptions.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-slate-500 dark:text-slate-500">
                      No subscriptions yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <Modal
        isOpen={showCreateModal}
        onClose={() => {
          setShowCreateModal(false);
          resetCreateForm();
        }}
        title="Add Subscription Plan"
      >
        <div className="space-y-4">
          {createError && (
            <div className="rounded-lg border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 text-xs px-3 py-2">
              {createError}
            </div>
          )}

          <div>
            <label className={LABEL_CLASS}>Plan Code</label>
            <select
              value={newPlan.code}
              onChange={(e) => setNewPlan((prev) => ({ ...prev, code: e.target.value as PlanCode }))}
              className={INPUT_CLASS}
            >
              <option value="">Select a plan code…</option>
              {availablePlanCodes.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={LABEL_CLASS}>Plan Name</label>
            <input
              type="text"
              value={newPlan.name}
              onChange={(e) => setNewPlan((prev) => ({ ...prev, name: e.target.value }))}
              placeholder="e.g. Enterprise"
              className={INPUT_CLASS}
            />
          </div>

          <div>
            <label className={LABEL_CLASS}>Description (optional)</label>
            <textarea
              value={newPlan.description}
              onChange={(e) => setNewPlan((prev) => ({ ...prev, description: e.target.value }))}
              placeholder="Shown to users on the pricing page"
              rows={2}
              className={`${INPUT_CLASS} h-auto py-2 resize-none`}
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={LABEL_CLASS}>Currency</label>
              <select
                value={newPlan.currency}
                onChange={(e) => setNewPlan((prev) => ({ ...prev, currency: e.target.value }))}
                className={INPUT_CLASS}
              >
                <option value="INR">INR</option>
                <option value="USD">USD</option>
              </select>
            </div>
            <div>
              <label className={LABEL_CLASS}>Monthly Price</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={newPlan.monthlyPrice}
                onChange={(e) => setNewPlan((prev) => ({ ...prev, monthlyPrice: e.target.value }))}
                placeholder="0.00"
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label className={LABEL_CLASS}>Yearly Price</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={newPlan.yearlyPrice}
                onChange={(e) => setNewPlan((prev) => ({ ...prev, yearlyPrice: e.target.value }))}
                placeholder="0.00"
                className={INPUT_CLASS}
              />
            </div>
          </div>

          <div>
            <label className={LABEL_CLASS}>Trial Days</label>
            <input
              type="number"
              min="0"
              value={newPlan.trialDays}
              onChange={(e) => setNewPlan((prev) => ({ ...prev, trialDays: e.target.value }))}
              className={INPUT_CLASS}
            />
          </div>

          <p className="text-[10px] text-slate-400 dark:text-slate-500 font-mono">
            New plans start with every feature/usage limit disabled — configure entitlements after creating.
          </p>

          <div className="flex space-x-3 pt-2">
            <Button variant="secondary" className="flex-1" onClick={() => setShowCreateModal(false)}>
              Cancel
            </Button>
            <Button variant="primary" className="flex-1" onClick={handleCreatePlan} loading={creating}>
              Create Plan
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
