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

export default function AccountPage() {
  const router = useRouter();
  const { logout } = useWorkspace();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  useEffect(() => {
    async function loadAccountData() {
      try {
        const [meRes, sessionsRes] = await Promise.all([
          fetch('/api/auth/me').then((r) => r.json()),
          fetch('/api/auth/sessions').then((r) => r.json()).catch(() => ({ data: [] }))
        ]);

        if (meRes.authenticated && meRes.user) {
          setProfile(meRes.user);
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

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
        <div className="text-xs text-indigo-400 font-mono animate-pulse">Loading Account Identity...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 sm:p-10">
      <div className="max-w-4xl mx-auto space-y-8">
        <div>
          <h1 className="text-2xl font-bold bg-gradient-to-r from-white to-indigo-300 bg-clip-text text-transparent">
            Account Settings & Session Security
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Canonical profile identity, authentication provider details, and active device sessions.
          </p>
        </div>

        {actionMsg && (
          <div className="p-3 rounded-lg bg-emerald-950/80 border border-emerald-800 text-xs text-emerald-300">
            {actionMsg}
          </div>
        )}

        {/* Profile Information Card */}
        {profile && (
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5">
            <h3 className="text-sm font-semibold text-white border-b border-slate-800 pb-3 flex items-center justify-between">
              <span>Profile Information</span>
              <span className="text-[10px] font-mono text-indigo-400">Canonical Identity (/api/auth/me)</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 text-xs">
              <div>
                <span className="text-slate-400 block mb-1">Full Name</span>
                <span className="font-medium text-white">{profile.name}</span>
              </div>

              <div>
                <span className="text-slate-400 block mb-1">Email Address</span>
                <span className="font-mono text-white">{profile.email}</span>
              </div>

              <div>
                <span className="text-slate-400 block mb-1">Account Role</span>
                <span className={`inline-block px-2.5 py-0.5 rounded text-[10px] font-mono font-bold ${profile.role === 'ADMIN' ? 'bg-rose-950 text-rose-300 border border-rose-800' : 'bg-indigo-950 text-indigo-300 border border-indigo-800'}`}>
                  {profile.role}
                </span>
              </div>

              <div>
                <span className="text-slate-400 block mb-1">Authentication Method</span>
                <span className="font-mono text-slate-200">{profile.authProvider}</span>
              </div>

              <div>
                <span className="text-slate-400 block mb-1">Email Verification</span>
                <span className="text-emerald-400 font-medium">{profile.emailVerified ? '✓ Verified' : 'Unverified'}</span>
              </div>

              <div>
                <span className="text-slate-400 block mb-1">Account Status</span>
                <span className="text-emerald-400 font-medium font-mono">{profile.status}</span>
              </div>

              <div>
                <span className="text-slate-400 block mb-1">Account Created</span>
                <span className="text-slate-300">{new Date(profile.createdAt).toLocaleDateString()}</span>
              </div>

              <div>
                <span className="text-slate-400 block mb-1">Last Login</span>
                <span className="text-slate-300">{new Date(profile.lastLoginAt || profile.createdAt).toLocaleString()}</span>
              </div>
            </div>
          </div>
        )}

        {/* Active Device Sessions Card */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h3 className="text-sm font-semibold text-white">Active Device Sessions</h3>
            <button
              onClick={() => handleRevokeSession(undefined, true)}
              className="text-xs text-rose-400 hover:text-rose-300 font-medium transition"
            >
              Revoke All Devices
            </button>
          </div>

          <div className="space-y-3">
            {sessions.map((s) => (
              <div key={s.id} className="flex items-center justify-between p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80 text-xs">
                <div className="space-y-1">
                  <div className="flex items-center space-x-2">
                    <span className="font-medium text-white">{s.deviceInfo}</span>
                    {s.isCurrent && (
                      <span className="px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 text-[10px] font-mono">
                        Current Device
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-400 font-mono">
                    IP: {s.ipAddress} • Created: {new Date(s.createdAt).toLocaleString()}
                  </div>
                </div>

                {!s.isCurrent && (
                  <button
                    onClick={() => handleRevokeSession(s.id, false)}
                    className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-rose-300 text-[11px] rounded transition"
                  >
                    Revoke
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Session Logout Control */}
        <div className="flex justify-end">
          <button
            onClick={handleLogout}
            className="py-2.5 px-5 bg-rose-950 hover:bg-rose-900 text-rose-200 border border-rose-800 rounded-xl text-xs font-medium transition shadow-lg"
          >
            Sign Out Current Session
          </button>
        </div>
      </div>
    </div>
  );
}
