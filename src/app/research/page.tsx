'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import Link from 'next/link';

export default function ResearchDashboardPage() {
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('ALL');

  useEffect(() => {
    async function loadSessions() {
      try {
        const res = await fetch('/api/research');
        const data = await res.json();
        if (data.success) {
          setSessions(data.data || []);
        }
      } catch (err) {
        console.error('Failed to load research sessions:', err);
      } finally {
        setLoading(false);
      }
    }
    loadSessions();
  }, []);

  const filteredSessions = sessions.filter((s) => {
    if (filter === 'COMPLETED') return s.status === 'COMPLETED';
    if (filter === 'IN_PROGRESS') return ['RECEIVED', 'PLANNING', 'READY', 'SEARCHING', 'COLLECTING_EVIDENCE', 'ANALYZING', 'GAP_ANALYSIS', 'FOLLOW_UP_RESEARCH', 'VERIFYING', 'SYNTHESIZING'].includes(s.status);
    if (filter === 'PARTIAL') return ['PARTIAL', 'LIMIT_REACHED', 'NO_EVIDENCE'].includes(s.status);
    return true;
  });

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-6">
        <div>
          <div className="flex items-center space-x-2">
            <span className="text-2xl">🤖</span>
            <h1 className="text-2xl font-bold text-white tracking-tight">Agentic Research</h1>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 uppercase tracking-wide">
              Phase 34
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Autonomous multi-source evidence investigation, claim extraction, conflict detection & report synthesis.
          </p>
        </div>

        <Link
          href="/research/new"
          className="inline-flex items-center justify-center space-x-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold px-4 py-2.5 rounded-xl transition shadow-lg shadow-indigo-500/25"
        >
          <span>+ Start New Research</span>
        </Link>
      </div>

      {/* Filter Tabs */}
      <div className="flex space-x-2 border-b border-slate-800 pb-3">
        {['ALL', 'COMPLETED', 'IN_PROGRESS', 'PARTIAL'].map((tab) => (
          <button
            key={tab}
            onClick={() => setFilter(tab)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              filter === tab
                ? 'bg-slate-800 text-white border border-slate-700'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {tab.replace('_', ' ')}
          </button>
        ))}
      </div>

      {/* Sessions Grid */}
      {loading ? (
        <div className="text-center py-12 text-xs text-slate-400">Loading research investigations...</div>
      ) : filteredSessions.length === 0 ? (
        <div className="text-center py-12 border border-dashed border-slate-800 rounded-2xl bg-slate-900/40 p-8 space-y-4">
          <span className="text-3xl">🔍</span>
          <h3 className="text-sm font-semibold text-white">No Research Investigations Found</h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            Start an autonomous research session with your documents, Knowledge Base, or live web evidence.
          </p>
          <Link
            href="/research/new"
            className="inline-block bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold px-4 py-2 rounded-xl transition"
          >
            Create Research Investigation
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredSessions.map((s) => (
            <Link
              key={s.id}
              href={`/research/${s.id}`}
              className="group block p-5 rounded-2xl bg-slate-900/80 border border-slate-800 hover:border-indigo-500/50 transition hover:shadow-xl space-y-4"
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-sm font-semibold text-white group-hover:text-indigo-400 transition line-clamp-2">
                  {s.title}
                </h3>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase shrink-0 ${
                    s.status === 'COMPLETED'
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      : s.status === 'CANCELLED'
                      ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                      : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                  }`}
                >
                  {s.status}
                </span>
              </div>

              <p className="text-xs text-slate-400 line-clamp-2">{s.question}</p>

              <div className="flex items-center justify-between text-[11px] text-slate-400 border-t border-slate-800/80 pt-3">
                <div className="flex items-center space-x-3">
                  <span>🌐 {s._count?.sources || s.sourceCount || 0} sources</span>
                  <span>📌 {s._count?.claims || s.claimCount || 0} claims</span>
                </div>
                <span className="text-indigo-400 font-semibold">{s.researchMode}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
