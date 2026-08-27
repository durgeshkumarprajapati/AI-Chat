'use client';

import React, { useEffect, useState } from 'react';
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

  useEffect(() => {
    async function loadAccountData() {
      try {
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
      <div className="min-h-[calc(100vh-61px)] bg-[#0f131d] text-[#dfe2f1] flex items-center justify-center p-6 font-sans">
        <div className="flex flex-col items-center space-y-3">
          <div className="w-8 h-8 rounded-full border-2 border-[#4d8eff] border-t-transparent animate-spin" />
          <div className="text-xs text-[#adc6ff] font-mono animate-pulse">Loading Workspace Control Center...</div>
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
    <div className="min-h-[calc(100vh-61px)] bg-[#0f131d] text-[#dfe2f1] p-6 sm:p-8 font-sans selection:bg-[#4d8eff] selection:text-white">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Page Header */}
        <div className="space-y-1.5 border-b border-[#424754]/50 pb-6">
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#dfe2f1] font-sans tracking-tight">
            Account & Workspace Settings
          </h1>
          <p className="text-xs sm:text-sm text-[#8c909f] font-sans max-w-3xl">
            Manage your organizational profile, control API access, oversee team members, and configure billing settings for your Enterprise AI deployment.
          </p>
        </div>

        {actionMsg && (
          <div className="p-3.5 rounded-xl bg-[#4edea3]/10 border border-[#4edea3]/40 text-xs font-semibold text-[#4edea3] flex items-center justify-between">
            <span>✓ {actionMsg}</span>
            <button onClick={() => setActionMsg(null)} className="text-xs text-[#4edea3] hover:underline">Dismiss</button>
          </div>
        )}

        {/* 12-Column Responsive Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* LEFT COLUMN (4 Cols): Profile Card & Billing Card */}
          <div className="lg:col-span-4 space-y-6">
            {/* Profile Card */}
            {profile && (
              <div className="bg-[#0a0e18]/95 backdrop-blur-md border border-[#424754] rounded-2xl p-6 shadow-2xl space-y-6 relative overflow-hidden">
                <div className="flex items-center justify-between border-b border-[#424754]/60 pb-3">
                  <h3 className="text-sm font-extrabold text-[#dfe2f1] font-sans tracking-tight">Profile</h3>
                  <span className="text-[10px] font-mono text-[#4d8eff] bg-[#4d8eff]/10 px-2 py-0.5 rounded-md border border-[#4d8eff]/30 font-bold uppercase">
                    {profile.role}
                  </span>
                </div>

                {/* Avatar & Name Header */}
                <div className="flex flex-col items-center text-center space-y-3 pt-2">
                  <div className="relative">
                    <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[#4d8eff] to-[#adc6ff] text-[#0a0e18] font-extrabold flex items-center justify-center text-2xl shadow-xl shadow-[#4d8eff]/20 border-2 border-[#424754]">
                      {initials}
                    </div>
                    <span className="absolute bottom-0 right-0 w-4 h-4 rounded-full bg-[#4edea3] border-2 border-[#0a0e18] shadow-sm" title="Active Account" />
                  </div>
                  <div>
                    <h4 className="text-base font-extrabold text-[#dfe2f1] font-sans">{profile.name}</h4>
                    <p className="text-xs text-[#8c909f] font-mono">Lead AI Architect</p>
                  </div>
                  <span className="inline-block px-3 py-0.5 rounded-full bg-[#4d8eff]/15 text-[#adc6ff] text-[10px] font-mono font-bold border border-[#4d8eff]/30 uppercase">
                    {profile.role}
                  </span>
                </div>

                {/* Account Details Hierarchy */}
                <div className="space-y-4 pt-2 border-t border-[#424754]/60 text-xs">
                  <div className="space-y-1">
                    <label className="block text-[10px] font-mono font-bold text-[#8c909f] uppercase tracking-wider">
                      Email Address
                    </label>
                    <div className="p-3 bg-[#0f131d] border border-[#424754] rounded-xl text-xs font-mono text-[#dfe2f1] truncate">
                      {profile.email}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="block text-[10px] font-mono font-bold text-[#8c909f] uppercase tracking-wider">
                      Workspace ID
                    </label>
                    <div className="flex items-center justify-between p-3 bg-[#0f131d] border border-[#424754] rounded-xl text-xs font-mono text-[#dfe2f1]">
                      <span className="truncate">ws_{profile.id.substring(0, 12)}</span>
                      <button
                        onClick={() => handleCopyWsId(profile.id)}
                        className="ml-2 px-2.5 py-1 bg-[#171b26] hover:bg-[#1c1f2a] border border-[#424754] rounded-lg text-[10px] font-bold text-[#adc6ff] transition shrink-0"
                      >
                        {copiedWsId ? '✓ Copied' : 'Copy'}
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-2 text-[11px]">
                    <div className="p-2.5 bg-[#0f131d] border border-[#424754]/60 rounded-xl">
                      <span className="text-[#8c909f] block text-[10px] font-mono">STATUS</span>
                      <span className="text-[#4edea3] font-mono font-bold">● {profile.status}</span>
                    </div>
                    <div className="p-2.5 bg-[#0f131d] border border-[#424754]/60 rounded-xl">
                      <span className="text-[#8c909f] block text-[10px] font-mono">AUTH PROVIDER</span>
                      <span className="text-[#dfe2f1] font-mono capitalize">{profile.authProvider}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Billing & Plan Card */}
            <div className="bg-[#0a0e18]/95 backdrop-blur-md border border-[#424754] rounded-2xl p-6 shadow-2xl space-y-5">
              <div className="flex items-center justify-between border-b border-[#424754]/60 pb-3">
                <h3 className="text-sm font-extrabold text-[#dfe2f1] font-sans flex items-center space-x-2">
                  <span>💳</span>
                  <span>Billing & Plan</span>
                </h3>
                <span className="text-[10px] font-mono text-[#4edea3] bg-[#4edea3]/10 px-2 py-0.5 rounded-md border border-[#4edea3]/30 font-bold">
                  ACTIVE
                </span>
              </div>

              <div className="p-4 rounded-xl bg-gradient-to-br from-[#171b26] to-[#0f131d] border border-[#424754] flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-mono font-bold text-[#adc6ff] uppercase tracking-wider block">
                    CURRENT PLAN
                  </span>
                  <h4 className="text-base font-extrabold text-[#dfe2f1] font-sans">Enterprise Scale</h4>
                  <p className="text-[10px] text-[#8c909f] font-mono mt-0.5">Renews on Oct 01, 2026</p>
                </div>
                <div className="text-right">
                  <span className="text-xl font-extrabold text-[#dfe2f1] font-mono">$2,499</span>
                  <span className="text-[10px] text-[#8c909f] font-mono block">/month</span>
                </div>
              </div>

              <div className="space-y-3 text-xs">
                <div className="space-y-1">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-[#c2c6d6] font-medium">Vector Storage Usage</span>
                    <span className="text-[#adc6ff] font-mono font-bold">84%</span>
                  </div>
                  <div className="h-2 w-full bg-[#0f131d] border border-[#424754]/60 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-[#4d8eff] to-[#adc6ff] rounded-full w-[84%]" />
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-[#c2c6d6] font-medium">API Inference Capacity</span>
                    <span className="text-[#adc6ff] font-mono font-bold">60%</span>
                  </div>
                  <div className="h-2 w-full bg-[#0f131d] border border-[#424754]/60 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-[#4d8eff] to-[#adc6ff] rounded-full w-[60%]" />
                  </div>
                </div>
              </div>

              <div className="flex space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => alert('Billing portal management is configured for Enterprise deployment.')}
                  className="flex-1 h-10 bg-[#0f131d] hover:bg-[#141926] border border-[#424754] text-[#dfe2f1] text-xs font-bold rounded-xl transition shadow-sm"
                >
                  Manage
                </button>
                <button
                  type="button"
                  onClick={() => alert('Your workspace is currently on the highest Enterprise Scale tier.')}
                  className="flex-1 h-10 bg-gradient-to-r from-[#4d8eff] to-[#adc6ff] text-[#0a0e18] text-xs font-extrabold rounded-xl shadow-md shadow-[#4d8eff]/20 hover:opacity-90 transition"
                >
                  Upgrade Tier
                </button>
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN (8 Cols): API Key Management, Team Members, Active Sessions */}
          <div className="lg:col-span-8 space-y-6">
            {/* API Key Management Card */}
            <div className="bg-[#0a0e18]/95 backdrop-blur-md border border-[#424754] rounded-2xl p-6 shadow-2xl space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#424754]/60 pb-4">
                <div>
                  <h3 className="text-base font-extrabold text-[#dfe2f1] font-sans">API Key Management</h3>
                  <p className="text-xs text-[#8c909f] font-sans mt-0.5">
                    Manage your secret keys for programmable access to Document AI RAG endpoints.
                  </p>
                </div>
                <button
                  onClick={() => setActionMsg('Generated new production API key: sk_prod_...9a41')}
                  className="h-10 px-4 bg-gradient-to-r from-[#4d8eff] to-[#adc6ff] text-[#0a0e18] text-xs font-extrabold rounded-xl shadow-md shadow-[#4d8eff]/20 hover:opacity-90 transition flex items-center justify-center space-x-1.5 shrink-0"
                >
                  <span>+ Generate New Key</span>
                </button>
              </div>

              {/* API Keys Data Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-[#424754]/60 text-[10px] font-mono text-[#adc6ff] uppercase tracking-wider">
                      <th className="pb-3 font-bold">Key Name / Prefix</th>
                      <th className="pb-3 font-bold">Created</th>
                      <th className="pb-3 font-bold">Last Used</th>
                      <th className="pb-3 font-bold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#424754]/40 font-sans">
                    <tr className="hover:bg-[#171b26]/50 transition">
                      <td className="py-3.5 pr-3">
                        <div className="font-bold text-[#dfe2f1]">Production Inference</div>
                        <div className="font-mono text-[11px] text-[#8c909f] mt-0.5">sk_prod_...a9f2</div>
                      </td>
                      <td className="py-3.5 text-[#c2c6d6] font-mono">Aug 12, 2026</td>
                      <td className="py-3.5 text-[#c2c6d6] font-mono">2 mins ago</td>
                      <td className="py-3.5 text-right">
                        <button
                          onClick={() => setActionMsg('API Key sk_prod_...a9f2 revoked.')}
                          className="px-3 py-1 bg-rose-950/60 hover:bg-rose-900/80 text-rose-300 border border-rose-800/80 rounded-lg text-[11px] font-semibold transition"
                        >
                          Revoke
                        </button>
                      </td>
                    </tr>

                    <tr className="hover:bg-[#171b26]/50 transition">
                      <td className="py-3.5 pr-3">
                        <div className="font-bold text-[#dfe2f1]">Staging Env Integration</div>
                        <div className="font-mono text-[11px] text-[#8c909f] mt-0.5">sk_test_...b441</div>
                      </td>
                      <td className="py-3.5 text-[#c2c6d6] font-mono">Sep 01, 2026</td>
                      <td className="py-3.5 text-[#c2c6d6] font-mono">1 day ago</td>
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
            <div className="bg-[#0a0e18]/95 backdrop-blur-md border border-[#424754] rounded-2xl p-6 shadow-2xl space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#424754]/60 pb-4">
                <div>
                  <h3 className="text-base font-extrabold text-[#dfe2f1] font-sans">Team Members</h3>
                  <p className="text-xs text-[#8c909f] font-sans mt-0.5">
                    Manage workspace access, role assignments, and team permissions.
                  </p>
                </div>
                <div className="flex items-center space-x-2">
                  <input
                    type="text"
                    value={memberSearch}
                    onChange={(e) => setMemberSearch(e.target.value)}
                    placeholder="Search members..."
                    className="h-10 px-3 bg-[#0f131d] border border-[#424754] rounded-xl text-xs text-[#dfe2f1] placeholder-[#8c909f] focus:outline-none focus:border-[#4d8eff] transition"
                  />
                  <button
                    onClick={() => alert('Invite member modal initiated.')}
                    className="h-10 px-4 bg-[#0f131d] hover:bg-[#141926] border border-[#424754] text-[#adc6ff] text-xs font-bold rounded-xl transition shrink-0 flex items-center space-x-1"
                  >
                    <span>+ Invite</span>
                  </button>
                </div>
              </div>

              {/* Team Members Data Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-[#424754]/60 text-[10px] font-mono text-[#adc6ff] uppercase tracking-wider">
                      <th className="pb-3 font-bold">User</th>
                      <th className="pb-3 font-bold">Role</th>
                      <th className="pb-3 font-bold">Status</th>
                      <th className="pb-3 font-bold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#424754]/40 font-sans">
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
                          <tr key={member.id} className="hover:bg-[#171b26]/50 transition">
                            <td className="py-3.5 pr-3">
                              <div className="flex items-center space-x-3">
                                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#4d8eff] to-[#adc6ff] text-[#0a0e18] font-bold flex items-center justify-center text-xs">
                                  {mInitials}
                                </div>
                                <div>
                                  <div className="font-bold text-[#dfe2f1]">{member.name}</div>
                                  <div className="text-[11px] text-[#8c909f] font-mono">{member.email}</div>
                                </div>
                              </div>
                            </td>
                            <td className="py-3.5">
                              <span className="px-2 py-0.5 rounded bg-[#4d8eff]/15 text-[#adc6ff] font-mono text-[10px] font-bold border border-[#4d8eff]/30 uppercase">
                                {member.role}
                              </span>
                            </td>
                            <td className="py-3.5">
                              <span className="text-[#4edea3] font-mono text-[11px] font-bold flex items-center space-x-1">
                                <span>●</span>
                                <span>Active</span>
                              </span>
                            </td>
                            <td className="py-3.5 text-right">
                              <button
                                onClick={() => alert(`Manage permissions for ${member.name}`)}
                                className="p-1.5 text-[#8c909f] hover:text-[#dfe2f1] rounded-lg transition"
                                title="Manage User"
                              >
                                ⋮
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr className="hover:bg-[#171b26]/50 transition">
                        <td className="py-3.5 pr-3">
                          <div className="flex items-center space-x-3">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#4d8eff] to-[#adc6ff] text-[#0a0e18] font-bold flex items-center justify-center text-xs">
                              {initials}
                            </div>
                            <div>
                              <div className="font-bold text-[#dfe2f1]">{profile?.name}</div>
                              <div className="text-[11px] text-[#8c909f] font-mono">{profile?.email}</div>
                            </div>
                          </div>
                        </td>
                        <td className="py-3.5">
                          <span className="px-2 py-0.5 rounded bg-[#4d8eff]/15 text-[#adc6ff] font-mono text-[10px] font-bold border border-[#4d8eff]/30 uppercase">
                            {profile?.role || 'ADMIN'}
                          </span>
                        </td>
                        <td className="py-3.5">
                          <span className="text-[#4edea3] font-mono text-[11px] font-bold flex items-center space-x-1">
                            <span>●</span>
                            <span>Active</span>
                          </span>
                        </td>
                        <td className="py-3.5 text-right">
                          <button className="p-1.5 text-[#8c909f] hover:text-[#dfe2f1] rounded-lg transition">⋮</button>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Active Device Sessions Card */}
            <div className="bg-[#0a0e18]/95 backdrop-blur-md border border-[#424754] rounded-2xl p-6 shadow-2xl space-y-4">
              <div className="flex items-center justify-between border-b border-[#424754]/60 pb-3">
                <h3 className="text-base font-extrabold text-[#dfe2f1] font-sans">Active Device Sessions</h3>
                <button
                  onClick={() => handleRevokeSession(undefined, true)}
                  className="text-xs text-rose-400 hover:text-rose-300 font-semibold transition"
                >
                  Revoke All Devices
                </button>
              </div>

              <div className="space-y-3">
                {sessions.map((s) => (
                  <div key={s.id} className="flex items-center justify-between p-3.5 rounded-xl bg-[#0f131d] border border-[#424754]/60 text-xs">
                    <div className="space-y-1">
                      <div className="flex items-center space-x-2">
                        <span className="font-bold text-[#dfe2f1]">{s.deviceInfo}</span>
                        {s.isCurrent && (
                          <span className="px-2 py-0.5 rounded bg-[#4edea3]/15 text-[#4edea3] border border-[#4edea3]/30 text-[10px] font-mono font-bold">
                            Current Device
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-[#8c909f] font-mono">
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

              <div className="flex justify-end pt-3 border-t border-[#424754]/60">
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
