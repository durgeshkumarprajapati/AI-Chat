'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useWorkspace } from '@/context/WorkspaceContext';

interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: string;
  authProvider: string;
  emailVerified: boolean;
  avatarUrl?: string | null;
  status: string;
  createdAt: string;
  lastLoginAt?: string;
}

interface SessionItem {
  id: string;
  deviceInfo: string;
  ipAddress: string;
  createdAt: string;
  expiresAt: string;
  isCurrent: boolean;
}

interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  avatarUrl?: string | null;
  createdAt: string;
}

export default function AccountPage() {
  const router = useRouter();
  const { logout } = useWorkspace();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [copiedWsId, setCopiedWsId] = useState(false);
  const [memberSearch, setMemberSearch] = useState('');
  const [billingSummary, setBillingSummary] = useState<{ billingEnabled: boolean; planCode?: string; status?: string } | null>(null);

  useEffect(() => {
    async function loadAccountData() {
      try {
        // Phase 77: kicked off alongside the auth/sessions Promise.all instead of after it —
        // this fetch doesn't read anything from meRes/sessionsRes, so waiting for them to
        // settle first only added dead time before the request even started.
        const billingPromise = fetch('/api/billing/subscription')
          .then((r) => r.json())
          .catch(() => null);

        const [meRes, sessionsRes] = await Promise.all([
          fetch('/api/auth/me').then((r) => r.json()),
          fetch('/api/auth/sessions').then((r) => r.json()).catch(() => ({ data: [] }))
        ]);

        if (meRes.authenticated && meRes.user) {
          setProfile(meRes.user);

          // If user is ADMIN, load team members list
          if (meRes.user.role === 'ADMIN') {
            fetch('/api/admin/users')
              .then((r) => r.json())
              .then((data) => {
                if (data.success && Array.isArray(data.data)) {
                  setTeamMembers(data.data);
                }
              })
              .catch(() => {});
          }
        } else {
          router.push('/login');
        }
        setSessions(sessionsRes.data || []);

        billingPromise.then((data) => {
          if (data?.success) {
            setBillingSummary({
              billingEnabled: data.data.billingEnabled,
              planCode: data.data.subscription?.planCode,
              status: data.data.subscription?.status
            });
          }
        });
      } catch {
        router.push('/login');
      } finally {
        setLoading(false);
      }
    }
    loadAccountData();
  }, [router]);

  const handleRevokeSession = async (sessionId?: string, revokeAll?: boolean) => {
    try {
      const res = await fetch('/api/auth/sessions', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, revokeAll })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error?.message || 'Revocation failed');

      if (revokeAll) {
        await logout();
        return;
      }

      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
      setActionMsg('Session revoked successfully.');
      setTimeout(() => setActionMsg(null), 3000);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to revoke session');
    }
  };

  const handleLogout = async () => {
    await logout();
  };

  const handleCopyWsId = (id: string) => {
    const formattedId = `ws_${id.substring(0, 12)}`;
    navigator.clipboard.writeText(formattedId);
    setCopiedWsId(true);
    setTimeout(() => setCopiedWsId(false), 2000);
  };

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-61px)] bg-surface text-foreground flex items-center justify-center p-6 font-sans">
        <div className="flex flex-col items-center space-y-3">
          <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          <div className="text-xs text-primary font-mono animate-pulse">Loading Workspace Control Center...</div>
        </div>
      </div>
    );
  }

  const initials = profile?.name
    ? profile.name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : 'U';

  const filteredMembers = teamMembers.filter(
    (m) =>
      (m.name || '').toLowerCase().includes(memberSearch.toLowerCase()) ||
      (m.email || '').toLowerCase().includes(memberSearch.toLowerCase())
  );

  return (
    <div className="min-h-[calc(100vh-61px)] bg-surface text-foreground p-6 sm:p-8 font-sans selection:bg-primary selection:text-white">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Page Header */}
        <div className="space-y-1.5 border-b border-border/50 pb-6">
          <h1 className="text-2xl sm:text-3xl font-extrabold text-foreground font-sans tracking-tight">
            Account & Workspace Settings
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground font-sans max-w-3xl">
            Manage your organizational profile, control API access, oversee team members, and configure billing settings for your Enterprise AI deployment.
          </p>
        </div>

        {actionMsg && (
          <div className="p-3.5 rounded-xl bg-success/10 border border-success/40 text-xs font-semibold text-success flex items-center justify-between">
            <span>✓ {actionMsg}</span>
            <button onClick={() => setActionMsg(null)} className="text-xs text-success hover:underline">Dismiss</button>
          </div>
        )}

        {/* 12-Column Responsive Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* LEFT COLUMN (4 Cols): Profile Card & Billing Card */}
          <div className="lg:col-span-4 space-y-6">
            {/* Profile Card */}
            {profile && (
              <div className="bg-card backdrop-blur-md border border-border rounded-2xl p-6 shadow-2xl space-y-6 relative overflow-hidden">
                <div className="flex items-center justify-between border-b border-border/60 pb-3">
                  <h3 className="text-sm font-extrabold text-foreground font-sans tracking-tight">Profile</h3>
                  <span className="text-[10px] font-mono text-primary bg-primary/10 px-2 py-0.5 rounded-md border border-primary/30 font-bold uppercase">
                    {profile.role}
                  </span>
                </div>

                {/* Avatar & Name Header */}
                <div className="flex flex-col items-center text-center space-y-3 pt-2">
                  <div className="relative">
                    <div className="w-20 h-20 rounded-full bg-gradient-to-br from-primary to-primary-hover text-primary-foreground font-extrabold flex items-center justify-center text-2xl shadow-xl shadow-primary/20 border-2 border-border">
                      {initials}
                    </div>
                    <span className="absolute bottom-0 right-0 w-4 h-4 rounded-full bg-success border-2 border-background shadow-sm" title="Active Account" />
                  </div>
                  <div>
                    <h4 className="text-base font-extrabold text-foreground font-sans">{profile.name}</h4>
                    <p className="text-xs text-muted-foreground font-mono">Lead AI Architect</p>
                  </div>
                  <span className="inline-block px-3 py-0.5 rounded-full bg-primary/15 text-primary text-[10px] font-mono font-bold border border-primary/30 uppercase">
                    {profile.role}
                  </span>
                </div>

                {/* Account Details Hierarchy */}
                <div className="space-y-4 pt-2 border-t border-border/60 text-xs">
                  <div className="space-y-1">
                    <label className="block text-[10px] font-mono font-bold text-muted-foreground uppercase tracking-wider">
                      Email Address
                    </label>
                    <div className="p-3 bg-surface border border-border rounded-xl text-xs font-mono text-foreground truncate">
                      {profile.email}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="block text-[10px] font-mono font-bold text-muted-foreground uppercase tracking-wider">
                      Workspace ID
                    </label>
                    <div className="flex items-center justify-between p-3 bg-surface border border-border rounded-xl text-xs font-mono text-foreground">
                      <span className="truncate">ws_{profile.id.substring(0, 12)}</span>
                      <button
                        onClick={() => handleCopyWsId(profile.id)}
                        className="ml-2 px-2.5 py-1 bg-surface-hover hover:bg-surface-hover border border-border rounded-lg text-[10px] font-bold text-primary transition shrink-0"
                      >
                        {copiedWsId ? '✓ Copied' : 'Copy'}
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-2 text-[11px]">
                    <div className="p-2.5 bg-surface border border-border/60 rounded-xl">
                      <span className="text-muted-foreground block text-[10px] font-mono">STATUS</span>
                      <span className="text-success font-mono font-bold">● {profile.status}</span>
                    </div>
                    <div className="p-2.5 bg-surface border border-border/60 rounded-xl">
                      <span className="text-muted-foreground block text-[10px] font-mono">AUTH PROVIDER</span>
                      <span className="text-foreground font-mono capitalize">{profile.authProvider}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Billing & Plan Card */}
            <div className="bg-card backdrop-blur-md border border-border rounded-2xl p-6 shadow-2xl space-y-5">
              <div className="flex items-center justify-between border-b border-border/60 pb-3">
                <h3 className="text-sm font-extrabold text-foreground font-sans flex items-center space-x-2">
                  <span>💳</span>
                  <span>Billing & Plan</span>
                </h3>
                {billingSummary?.status && (
                  <span className="text-[10px] font-mono text-success bg-success/10 px-2 py-0.5 rounded-md border border-success/30 font-bold">
                    {billingSummary.status}
                  </span>
                )}
              </div>

              <div className="p-4 rounded-xl bg-gradient-to-br from-surface-hover to-surface border border-border">
                {billingSummary?.billingEnabled ? (
                  <div>
                    <span className="text-[10px] font-mono font-bold text-primary uppercase tracking-wider block">
                      CURRENT PLAN
                    </span>
                    <h4 className="text-base font-extrabold text-foreground font-sans">{billingSummary.planCode}</h4>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Billing is not yet enabled for this workspace — every feature is currently available to you at no
                    charge.
                  </p>
                )}
              </div>

              <div className="flex space-x-3 pt-2">
                <Link
                  href="/billing"
                  className="flex-1 h-10 flex items-center justify-center bg-surface hover:bg-surface-hover border border-border text-foreground text-xs font-bold rounded-xl transition shadow-sm"
                >
                  Manage Billing
                </Link>
                <Link
                  href="/pricing"
                  className="flex-1 h-10 flex items-center justify-center bg-gradient-to-r from-primary to-primary-hover text-primary-foreground text-xs font-extrabold rounded-xl shadow-md shadow-primary/20 hover:opacity-90 transition"
                >
                  View Plans
                </Link>
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN (8 Cols): API Key Management, Team Members, Active Sessions */}
          <div className="lg:col-span-8 space-y-6">
            {/* API Key Management Card */}
            <div className="bg-card backdrop-blur-md border border-border rounded-2xl p-6 shadow-2xl space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/60 pb-4">
                <div>
                  <h3 className="text-base font-extrabold text-foreground font-sans">API Key Management</h3>
                  <p className="text-xs text-muted-foreground font-sans mt-0.5">
                    Manage your secret keys for programmable access to Document AI RAG endpoints.
                  </p>
                </div>
                <button
                  onClick={() => setActionMsg('Generated new production API key: sk_prod_...9a41')}
                  className="h-10 px-4 bg-gradient-to-r from-primary to-primary-hover text-primary-foreground text-xs font-extrabold rounded-xl shadow-md shadow-primary/20 hover:opacity-90 transition flex items-center justify-center space-x-1.5 shrink-0"
                >
                  <span>+ Generate New Key</span>
                </button>
              </div>

              {/* API Keys Data Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-border/60 text-[10px] font-mono text-primary uppercase tracking-wider">
                      <th className="pb-3 font-bold">Key Name / Prefix</th>
                      <th className="pb-3 font-bold">Created</th>
                      <th className="pb-3 font-bold">Last Used</th>
                      <th className="pb-3 font-bold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40 font-sans">
                    <tr className="hover:bg-surface-hover/50 transition">
                      <td className="py-3.5 pr-3">
                        <div className="font-bold text-foreground">Production Inference</div>
                        <div className="font-mono text-[11px] text-muted-foreground mt-0.5">sk_prod_...a9f2</div>
                      </td>
                      <td className="py-3.5 text-muted-foreground font-mono">Aug 12, 2026</td>
                      <td className="py-3.5 text-muted-foreground font-mono">2 mins ago</td>
                      <td className="py-3.5 text-right">
                        <button
                          onClick={() => setActionMsg('API Key sk_prod_...a9f2 revoked.')}
                          className="px-3 py-1 bg-rose-950/60 hover:bg-rose-900/80 text-rose-300 border border-rose-800/80 rounded-lg text-[11px] font-semibold transition"
                        >
                          Revoke
                        </button>
                      </td>
                    </tr>

                    <tr className="hover:bg-surface-hover/50 transition">
                      <td className="py-3.5 pr-3">
                        <div className="font-bold text-foreground">Staging Env Integration</div>
                        <div className="font-mono text-[11px] text-muted-foreground mt-0.5">sk_test_...b441</div>
                      </td>
                      <td className="py-3.5 text-muted-foreground font-mono">Sep 01, 2026</td>
                      <td className="py-3.5 text-muted-foreground font-mono">1 day ago</td>
                      <td className="py-3.5 text-right">
                        <button
                          onClick={() => setActionMsg('API Key sk_test_...b441 revoked.')}
                          className="px-3 py-1 bg-rose-950/60 hover:bg-rose-900/80 text-rose-300 border border-rose-800/80 rounded-lg text-[11px] font-semibold transition"
                        >
                          Revoke
                        </button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Team Members Card */}
            <div className="bg-card backdrop-blur-md border border-border rounded-2xl p-6 shadow-2xl space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/60 pb-4">
                <div>
                  <h3 className="text-base font-extrabold text-foreground font-sans">Team Members</h3>
                  <p className="text-xs text-muted-foreground font-sans mt-0.5">
                    Manage workspace access, role assignments, and team permissions.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    value={memberSearch}
                    onChange={(e) => setMemberSearch(e.target.value)}
                    placeholder="Search members..."
                    className="h-10 px-3 min-w-0 flex-1 bg-surface border border-border rounded-xl text-xs text-foreground placeholder-text-disabled focus:outline-none focus:border-primary transition"
                  />
                  <button
                    onClick={() => alert('Invite member modal initiated.')}
                    className="h-10 px-4 bg-surface hover:bg-surface-hover border border-border text-primary text-xs font-bold rounded-xl transition shrink-0 flex items-center space-x-1"
                  >
                    <span>+ Invite</span>
                  </button>
                </div>
              </div>

              {/* Team Members Data Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-border/60 text-[10px] font-mono text-primary uppercase tracking-wider">
                      <th className="pb-3 font-bold">User</th>
                      <th className="pb-3 font-bold">Role</th>
                      <th className="pb-3 font-bold">Status</th>
                      <th className="pb-3 font-bold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40 font-sans">
                    {filteredMembers.length > 0 ? (
                      filteredMembers.map((member) => {
                        const mInitials = member.name
                          ? member.name
                              .split(' ')
                              .map((n) => n[0])
                              .join('')
                              .toUpperCase()
                              .slice(0, 2)
                          : 'U';

                        return (
                          <tr key={member.id} className="hover:bg-surface-hover/50 transition">
                            <td className="py-3.5 pr-3">
                              <div className="flex items-center space-x-3">
                                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-primary-hover text-primary-foreground font-bold flex items-center justify-center text-xs">
                                  {mInitials}
                                </div>
                                <div>
                                  <div className="font-bold text-foreground">{member.name}</div>
                                  <div className="text-[11px] text-muted-foreground font-mono">{member.email}</div>
                                </div>
                              </div>
                            </td>
                            <td className="py-3.5">
                              <span className="px-2 py-0.5 rounded bg-primary/15 text-primary font-mono text-[10px] font-bold border border-primary/30 uppercase">
                                {member.role}
                              </span>
                            </td>
                            <td className="py-3.5">
                              <span className="text-success font-mono text-[11px] font-bold flex items-center space-x-1">
                                <span>●</span>
                                <span>Active</span>
                              </span>
                            </td>
                            <td className="py-3.5 text-right">
                              <button
                                onClick={() => alert(`Manage permissions for ${member.name}`)}
                                className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg transition"
                                title="Manage User"
                              >
                                ⋮
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr className="hover:bg-surface-hover/50 transition">
                        <td className="py-3.5 pr-3">
                          <div className="flex items-center space-x-3">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-primary-hover text-primary-foreground font-bold flex items-center justify-center text-xs">
                              {initials}
                            </div>
                            <div>
                              <div className="font-bold text-foreground">{profile?.name}</div>
                              <div className="text-[11px] text-muted-foreground font-mono">{profile?.email}</div>
                            </div>
                          </div>
                        </td>
                        <td className="py-3.5">
                          <span className="px-2 py-0.5 rounded bg-primary/15 text-primary font-mono text-[10px] font-bold border border-primary/30 uppercase">
                            {profile?.role || 'ADMIN'}
                          </span>
                        </td>
                        <td className="py-3.5">
                          <span className="text-success font-mono text-[11px] font-bold flex items-center space-x-1">
                            <span>●</span>
                            <span>Active</span>
                          </span>
                        </td>
                        <td className="py-3.5 text-right">
                          <button className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg transition">⋮</button>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Active Device Sessions Card */}
            <div className="bg-card backdrop-blur-md border border-border rounded-2xl p-6 shadow-2xl space-y-4">
              <div className="flex items-center justify-between border-b border-border/60 pb-3">
                <h3 className="text-base font-extrabold text-foreground font-sans">Active Device Sessions</h3>
                <button
                  onClick={() => handleRevokeSession(undefined, true)}
                  className="text-xs text-rose-400 hover:text-rose-300 font-semibold transition"
                >
                  Revoke All Devices
                </button>
              </div>

              <div className="space-y-3">
                {sessions.map((s) => (
                  <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 p-3.5 rounded-xl bg-surface border border-border/60 text-xs">
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-foreground break-words">{s.deviceInfo}</span>
                        {s.isCurrent && (
                          <span className="px-2 py-0.5 rounded bg-success/15 text-success border border-success/30 text-[10px] font-mono font-bold">
                            Current Device
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-muted-foreground font-mono">
                        IP: {s.ipAddress} • Created: {new Date(s.createdAt).toLocaleString()}
                      </div>
                    </div>

                    {!s.isCurrent && (
                      <button
                        onClick={() => handleRevokeSession(s.id, false)}
                        className="px-3 py-1 bg-rose-950/60 hover:bg-rose-900/80 text-rose-300 border border-rose-800/80 text-[11px] font-semibold rounded-lg transition"
                      >
                        Revoke
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <div className="flex justify-end pt-3 border-t border-border/60">
                <button
                  onClick={handleLogout}
                  className="py-2.5 px-5 bg-rose-950 hover:bg-rose-900 text-rose-200 border border-rose-800 rounded-xl text-xs font-bold transition shadow-lg"
                >
                  🚪 Sign Out Current Session
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
