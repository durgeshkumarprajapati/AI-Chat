'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';

interface UserItem {
  id: string;
  email: string;
  name?: string;
  role: 'ADMIN' | 'USER';
  createdAt: string;
}

interface Metrics {
  platform: {
    userCount: number;
    activeSessions: number;
    documentCount: number;
    conversationCount: number;
  };
  ragMetrics: {
    avgOverallScore: number;
    avgGroundednessScore: number;
    avgLatencyMs: number;
  };
}

export default function AdminDashboardPage() {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadAdminData() {
      try {
        const [usersRes, metricsRes] = await Promise.all([
          fetch('/api/admin/users').then((r) => r.json()),
          fetch('/api/admin/metrics').then((r) => r.json())
        ]);

        if (!usersRes.success) throw new Error(usersRes.error?.message || 'Access denied');
        setUsers(usersRes.data || []);
        setMetrics(metricsRes.data || null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Admin access required.');
      } finally {
        setLoading(false);
      }
    }
    loadAdminData();
  }, []);

  const handleRoleChange = async (userId: string, currentRole: 'ADMIN' | 'USER') => {
    const newRole = currentRole === 'ADMIN' ? 'USER' : 'ADMIN';
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, role: newRole })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error?.message || 'Role change failed');

      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role: newRole } : u)));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to change role');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
        <div className="text-xs text-indigo-400 font-mono animate-pulse">Loading Admin Dashboard...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6">
        <div className="bg-rose-950/80 border border-rose-800 text-rose-300 p-6 rounded-2xl max-w-md text-center">
          <h2 className="text-lg font-bold mb-2">Access Denied</h2>
          <p className="text-xs mb-4">{error}</p>
          <Link href="/dashboard" className="inline-block py-2 px-4 bg-slate-800 hover:bg-slate-700 text-white text-xs rounded-lg">
            Back to User Workspace
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 sm:p-10">
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-2xl font-bold bg-gradient-to-r from-white to-rose-300 bg-clip-text text-transparent">
                Admin Diagnostics & Platform Control
              </h1>
              <span className="px-2.5 py-0.5 rounded-full bg-rose-950 text-rose-300 border border-rose-800 text-[10px] font-mono font-bold">
                ADMIN ONLY
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              System health, user management, RAG quality inspection, cache analytics, and worker diagnostics.
            </p>
          </div>

          <div className="flex items-center space-x-3 text-xs">
            <Link href="/api/rag/debug" target="_blank" className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg text-slate-300">
              RAG Inspector ↗
            </Link>
            <Link href="/api/health" target="_blank" className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg text-slate-300">
              System Health ↗
            </Link>
          </div>
        </div>

        {/* Platform Metrics */}
        {metrics && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4">
              <div className="text-xs text-slate-400 font-medium">Total Users</div>
              <div className="text-2xl font-bold text-white mt-1">{metrics.platform.userCount}</div>
            </div>
            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4">
              <div className="text-xs text-slate-400 font-medium">Active Sessions</div>
              <div className="text-2xl font-bold text-emerald-400 mt-1">{metrics.platform.activeSessions}</div>
            </div>
            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4">
              <div className="text-xs text-slate-400 font-medium">Avg Groundedness</div>
              <div className="text-2xl font-bold text-sky-400 mt-1">{metrics.ragMetrics.avgGroundednessScore}</div>
            </div>
            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4">
              <div className="text-xs text-slate-400 font-medium">Avg Latency</div>
              <div className="text-2xl font-bold text-indigo-400 mt-1">{metrics.ragMetrics.avgLatencyMs}ms</div>
            </div>
          </div>
        )}

        {/* User Management Table */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
          <h3 className="text-sm font-semibold text-white border-b border-slate-800 pb-3">
            User Workspace Accounts & Role Assignments
          </h3>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950 text-slate-400 uppercase font-mono text-[10px]">
                <tr>
                  <th className="py-3 px-4">User Email</th>
                  <th className="py-3 px-4">Name</th>
                  <th className="py-3 px-4">Role</th>
                  <th className="py-3 px-4">Created</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-950/40">
                    <td className="py-3 px-4 font-mono">{u.email}</td>
                    <td className="py-3 px-4">{u.name || '—'}</td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${u.role === 'ADMIN' ? 'bg-rose-950 text-rose-300 border border-rose-800' : 'bg-slate-800 text-slate-300'}`}>
                        {u.role}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-400">{new Date(u.createdAt).toLocaleDateString()}</td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => handleRoleChange(u.id, u.role)}
                        className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-[11px] font-medium transition"
                      >
                        Set to {u.role === 'ADMIN' ? 'USER' : 'ADMIN'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
