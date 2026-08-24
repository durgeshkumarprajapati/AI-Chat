'use client';

export const dynamic = 'force-dynamic';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';

interface AuditItem {
  id: string;
  action: string;
  targetType: string;
  targetId?: string;
  details?: any;
  createdAt: string;
  actor: {
    id: string;
    email: string;
    name?: string;
    role: string;
  };
}

export default function AdminAuditLogsPage() {
  const [logs, setLogs] = useState<AuditItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterAction, setFilterAction] = useState('');

  useEffect(() => {
    async function loadLogs() {
      try {
        const url = filterAction ? `/api/admin/audit-logs?action=${encodeURIComponent(filterAction)}` : '/api/admin/audit-logs';
        const res = await fetch(url);
        const data = await res.json();
        if (data.success) {
          setLogs(data.data || []);
        }
      } catch {
        setLogs([]);
      } finally {
        setLoading(false);
      }
    }
    loadLogs();
  }, [filterAction]);

  return (
    <div className="min-h-screen p-6 sm:p-10 font-sans selection:bg-[#4d8eff] selection:text-white text-slate-900 dark:text-slate-100">
      <div className="w-full max-w-[1600px] mx-auto space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-2xl font-bold bg-gradient-to-r from-slate-900 via-rose-800 to-rose-600 dark:from-white dark:to-rose-300 bg-clip-text text-transparent">
                Security Audit Log Inspection
              </h1>
              <span className="px-2.5 py-0.5 rounded-full bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 text-[10px] font-mono font-bold">
                ADMIN ONLY
              </span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
              Immutable audit trial of authentication events, privilege changes, and administrative actions.
            </p>
          </div>

          <Link href="/admin" className="px-3 py-1.5 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg text-xs text-slate-700 dark:text-slate-300 font-semibold shadow-sm">
            ← Back to Admin Dashboard
          </Link>
        </div>

        {/* Filter Controls */}
        <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 flex items-center space-x-3 text-xs shadow-sm">
          <span className="text-slate-600 dark:text-slate-400 font-medium">Filter Action:</span>
          <select
            value={filterAction}
            onChange={(e) => setFilterAction(e.target.value)}
            className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
          >
            <option value="">All Security Events</option>
            <option value="LOGIN_SUCCESS">LOGIN_SUCCESS</option>
            <option value="LOGIN_FAILED">LOGIN_FAILED</option>
            <option value="GOOGLE_LOGIN">GOOGLE_LOGIN</option>
            <option value="ROLE_CHANGE">ROLE_CHANGE</option>
            <option value="SESSION_REVOKED">SESSION_REVOKED</option>
            <option value="ALL_SESSIONS_REVOKED">ALL_SESSIONS_REVOKED</option>
            <option value="ADMIN_ACTION">ADMIN_ACTION</option>
          </select>
        </div>

        {/* Audit Log Table */}
        <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm dark:shadow-xl space-y-4">
          {loading ? (
            <div className="text-xs text-indigo-600 dark:text-indigo-400 font-mono animate-pulse py-8 text-center">Loading audit logs...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-700 dark:text-slate-300">
                <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-400 uppercase font-mono text-[10px]">
                  <tr>
                    <th className="py-3 px-4">Timestamp</th>
                    <th className="py-3 px-4">Security Event</th>
                    <th className="py-3 px-4">Actor</th>
                    <th className="py-3 px-4">Target Type</th>
                    <th className="py-3 px-4">Target ID</th>
                    <th className="py-3 px-4">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {logs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-slate-950/40">
                      <td className="py-3 px-4 text-slate-500 dark:text-slate-400 font-mono">{new Date(log.createdAt).toLocaleString()}</td>
                      <td className="py-3 px-4 font-mono font-bold text-indigo-600 dark:text-indigo-400">{log.action}</td>
                      <td className="py-3 px-4">{log.actor?.email || log.actor?.name || 'System'}</td>
                      <td className="py-3 px-4 font-mono text-slate-500 dark:text-slate-400">{log.targetType}</td>
                      <td className="py-3 px-4 font-mono text-slate-500 dark:text-slate-400">{log.targetId ? log.targetId.slice(0, 12) + '...' : '—'}</td>
                      <td className="py-3 px-4 font-mono text-[11px] text-slate-500 dark:text-slate-400 max-w-xs truncate">
                        {log.details ? JSON.stringify(log.details) : '{}'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
