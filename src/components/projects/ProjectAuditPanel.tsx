'use client';

import { useState, useEffect, useCallback } from 'react';
import { AuditLogItem } from '@/features/audit/audit.service';

interface ProjectAuditPanelProps {
  projectId: string;
}

export function ProjectAuditPanel({ projectId }: ProjectAuditPanelProps) {
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [actionFilter, setActionFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const query = new URLSearchParams({
        page: page.toString(),
        pageSize: '15',
        ...(actionFilter ? { action: actionFilter } : {})
      });
      const res = await fetch(`/api/projects/${projectId}/audit?${query}`);
      const json = await res.json();

      if (json.success) {
        setLogs(json.data.items || []);
        setTotal(json.data.total || 0);
      } else {
        setError(json.error?.message || 'Failed to load audit activity');
      }
    } catch (err) {
      setError('Network error fetching audit logs');
    } finally {
      setLoading(false);
    }
  }, [projectId, page, actionFilter]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const totalPages = Math.ceil(total / 15) || 1;

  const actionTypes = [
    'PROJECT_CREATED',
    'PROJECT_UPDATED',
    'PROJECT_DELETED',
    'PROJECT_MEMBER_ADDED',
    'PROJECT_MEMBER_REMOVED',
    'PROJECT_MEMBER_ROLE_CHANGED',
    'PROJECT_SOURCE_ATTACHED',
    'PROJECT_SOURCE_REMOVED',
    'PROJECT_CONVERSATION_CREATED',
    'PROJECT_MESSAGE_SENT',
    'PROJECT_AI_QUERY',
    'PROJECT_AI_RESPONSE'
  ];

  return (
    <div className="space-y-4">
      {/* Filters Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-slate-900/60 border border-slate-800 rounded-xl">
        <div className="flex items-center space-x-2">
          <span className="text-xs font-semibold text-slate-400">Filter Event:</span>
          <select
            value={actionFilter}
            onChange={(e) => {
              setActionFilter(e.target.value);
              setPage(1);
            }}
            className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
          >
            <option value="">All Audit Events</option>
            {actionTypes.map((action) => (
              <option key={action} value={action}>
                {action}
              </option>
            ))}
          </select>
        </div>

        <button
          onClick={fetchLogs}
          className="px-3 py-1.5 rounded-lg bg-indigo-950/60 hover:bg-indigo-900/80 border border-indigo-800/80 text-xs font-semibold text-indigo-300 transition-colors"
        >
          🔄 Refresh
        </button>
      </div>

      {error && (
        <div className="p-3 bg-rose-950/40 border border-rose-800/80 rounded-xl text-rose-300 text-xs font-mono">
          ⚠️ {error}
        </div>
      )}

      {/* Activity Table */}
      <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950/40 shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-900/80 border-b border-slate-800 text-[11px] font-bold uppercase tracking-wider text-slate-400">
              <tr>
                <th className="p-3">Timestamp</th>
                <th className="p-3">Actor</th>
                <th className="p-3">Action</th>
                <th className="p-3">Resource Target</th>
                <th className="p-3">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {loading ? (
                <tr>
                  <td colSpan={5} className="text-center py-8 text-slate-500 font-mono">
                    Loading audit trail...
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-8 text-slate-500 font-mono">
                    No audit events recorded.
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-900/40 transition-colors">
                    <td className="p-3 font-mono text-[11px] text-slate-400 whitespace-nowrap">
                      {new Date(log.createdAt).toLocaleString()}
                    </td>
                    <td className="p-3 font-medium text-slate-200">
                      {log.actor?.name || log.actor?.email || log.actorId}
                    </td>
                    <td className="p-3">
                      <span className="inline-block px-2 py-0.5 rounded text-[10px] font-mono bg-indigo-950 border border-indigo-800/60 text-indigo-300 font-semibold">
                        {log.action}
                      </span>
                    </td>
                    <td className="p-3 font-mono text-[11px] text-slate-400">
                      {log.targetType} {log.targetId ? `(${log.targetId.substring(0, 8)}...)` : ''}
                    </td>
                    <td className="p-3 font-mono text-[11px] text-slate-400 max-w-xs truncate">
                      {log.details ? JSON.stringify(log.details) : '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        {totalPages > 1 && (
          <div className="p-3 border-t border-slate-800 flex items-center justify-between bg-slate-900/60 text-xs font-mono">
            <span className="text-slate-400">
              Page {page} of {totalPages} ({total} entries)
            </span>
            <div className="flex space-x-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-300 font-semibold"
              >
                Previous
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-300 font-semibold"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
