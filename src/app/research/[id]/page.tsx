'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';

export default function ResearchSessionPage({ params }: { params: { id: string } }) {
  const [session, setSession] = useState<any>(null);
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'REPORT' | 'TIMELINE' | 'CLAIMS' | 'CONFLICTS' | 'SOURCES'>('REPORT');

  const [followUpQuery, setFollowUpQuery] = useState('');
  const [submittingFollowUp, setSubmittingFollowUp] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    async function loadData() {
      try {
        const [sessRes, evRes] = await Promise.all([
          fetch(`/api/research/${params.id}`),
          fetch(`/api/research/${params.id}/events`)
        ]);

        const sessData = await sessRes.json();
        const evData = await evRes.json();

        if (sessData.success) setSession(sessData.data);
        if (evData.success) setEvents(evData.data || []);
      } catch (err) {
        console.error('Failed to load research session data:', err);
      } finally {
        setLoading(false);
      }
    }

    loadData();

    // Poll status while session is active
    const interval = setInterval(() => {
      if (session && !['COMPLETED', 'CANCELLED', 'FAILED', 'LIMIT_REACHED', 'NO_EVIDENCE'].includes(session.status)) {
        loadData();
      }
    }, 3000);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id, session?.status]);

  const handleCancelResearch = async () => {
    setCancelling(true);
    try {
      await fetch(`/api/research/${params.id}/cancel`, { method: 'POST' });
      setSession((prev: any) => ({ ...prev, status: 'CANCELLED' }));
    } catch (err) {
      console.error('Failed to cancel research:', err);
    } finally {
      setCancelling(false);
    }
  };

  const handleFollowUp = async () => {
    if (!followUpQuery.trim()) return;
    setSubmittingFollowUp(true);

    try {
      const res = await fetch(`/api/research/${params.id}/follow-up`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: followUpQuery.trim() })
      });
      const data = await res.json();
      if (data.success && data.data?.sessionId) {
        window.location.href = `/research/${data.data.sessionId}`;
      }
    } catch (err) {
      console.error('Failed to submit follow-up research:', err);
    } finally {
      setSubmittingFollowUp(false);
    }
  };

  const handleExport = async (format: 'markdown' | 'json') => {
    try {
      const res = await fetch(`/api/research/${params.id}/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ format })
      });

      if (format === 'markdown') {
        const text = await res.text();
        const blob = new Blob([text], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Research_Report_${params.id.slice(0, 8)}.md`;
        a.click();
      } else {
        const json = await res.json();
        const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Research_Data_${params.id.slice(0, 8)}.json`;
        a.click();
      }
    } catch (err) {
      console.error('Failed to export research:', err);
    }
  };

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto p-12 text-center text-xs text-slate-400">
        Loading research investigation...
      </div>
    );
  }

  if (!session) {
    return (
      <div className="max-w-5xl mx-auto p-12 text-center text-xs text-rose-400 font-semibold">
        Research Investigation Not Found
      </div>
    );
  }

  const latestReport = session.reports?.[0]?.reportContent;
  const isExecuting = !['COMPLETED', 'CANCELLED', 'FAILED', 'LIMIT_REACHED', 'NO_EVIDENCE'].includes(session.status);

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      {/* Session Title & Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-6">
        <div>
          <div className="flex items-center space-x-3">
            <h1 className="text-xl font-bold text-white tracking-tight">{session.title}</h1>
            <span
              className={`px-2.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                session.status === 'COMPLETED'
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  : session.status === 'CANCELLED'
                  ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                  : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
              }`}
            >
              {session.status}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">{session.question}</p>
        </div>

        <div className="flex items-center space-x-2">
          {isExecuting && (
            <button
              onClick={handleCancelResearch}
              disabled={cancelling}
              className="bg-rose-600/20 hover:bg-rose-600/30 text-rose-400 border border-rose-500/30 text-xs font-semibold px-3 py-2 rounded-xl transition"
            >
              {cancelling ? 'Stopping...' : 'Stop Research'}
            </button>
          )}

          <button
            onClick={() => handleExport('markdown')}
            className="bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold px-3 py-2 rounded-xl border border-slate-700 transition"
          >
            Export Markdown
          </button>
          <button
            onClick={() => handleExport('json')}
            className="bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold px-3 py-2 rounded-xl border border-slate-700 transition"
          >
            Export JSON
          </button>
        </div>
      </div>

      {/* Progress Bar */}
      {isExecuting && (
        <div className="space-y-1 bg-slate-900/60 p-4 rounded-xl border border-slate-800">
          <div className="flex justify-between text-xs text-slate-300 font-semibold">
            <span>Autonomous Investigation in Progress...</span>
            <span>{session.progressPercent || 20}%</span>
          </div>
          <div className="w-full h-2 bg-slate-950 rounded-full overflow-hidden">
            <div
              className="h-full bg-indigo-500 transition-all duration-500"
              style={{ width: `${session.progressPercent || 20}%` }}
            />
          </div>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex space-x-2 border-b border-slate-800 pb-3">
        {[
          { id: 'REPORT', label: 'Research Report' },
          { id: 'TIMELINE', label: `Timeline (${events.length})` },
          { id: 'CLAIMS', label: `Verified Claims (${session.claims?.length || 0})` },
          { id: 'CONFLICTS', label: `Disclosed Conflicts (${session.conflicts?.length || 0})` },
          { id: 'SOURCES', label: `Sources (${session.sources?.length || 0})` }
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition ${
              activeTab === tab.id
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/20'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-6">
        {activeTab === 'REPORT' && (
          <div className="prose prose-invert max-w-none text-xs leading-relaxed space-y-4">
            {latestReport ? (
              <div className="whitespace-pre-wrap font-sans text-slate-200">{latestReport}</div>
            ) : isExecuting ? (
              <div className="text-center py-12 text-slate-400 space-y-2">
                <span className="text-2xl animate-spin inline-block">⚡</span>
                <p>Synthesizing research report from collected evidence...</p>
              </div>
            ) : (
              <div className="text-center py-8 text-slate-400">No report generated.</div>
            )}
          </div>
        )}

        {activeTab === 'TIMELINE' && (
          <div className="space-y-3">
            {events.length === 0 ? (
              <p className="text-xs text-slate-500">No execution events recorded yet.</p>
            ) : (
              events.map((ev, idx) => (
                <div key={idx} className="flex items-start space-x-3 text-xs p-2.5 rounded-xl bg-slate-950/60 border border-slate-850">
                  <span className="text-indigo-400 font-bold">✓</span>
                  <div>
                    <span className="font-semibold text-white">{ev.eventType.replace('_', ' ')}</span>
                    <span className="text-slate-500 text-[10px] ml-2">{new Date(ev.createdAt).toLocaleTimeString()}</span>
                    {ev.metadata && Object.keys(ev.metadata).length > 0 && (
                      <p className="text-slate-400 text-[11px] mt-0.5">{JSON.stringify(ev.metadata)}</p>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'CLAIMS' && (
          <div className="space-y-3">
            {!session.claims || session.claims.length === 0 ? (
              <p className="text-xs text-slate-500">No atomic claims extracted yet.</p>
            ) : (
              session.claims.map((claim: any) => (
                <div key={claim.id} className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs space-y-1">
                  <div className="font-semibold text-slate-200">{claim.claimText}</div>
                  <div className="flex items-center space-x-2 text-[10px] text-slate-400">
                    <span className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-400 font-bold">{claim.confidence}</span>
                    <span>Status: {claim.status}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'CONFLICTS' && (
          <div className="space-y-3">
            {!session.conflicts || session.conflicts.length === 0 ? (
              <p className="text-xs text-slate-500">No conflicting evidence detected across sources.</p>
            ) : (
              session.conflicts.map((conf: any) => (
                <div key={conf.id} className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs space-y-1">
                  <div className="font-bold text-amber-400 flex items-center space-x-1">
                    <span>⚠️</span>
                    <span>Discrepancy Detected ({conf.conflictType})</span>
                  </div>
                  <p className="text-slate-300 text-[11px]">{conf.resolutionSummary || 'Unresolved conflict between evidence items.'}</p>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'SOURCES' && (
          <div className="space-y-3">
            {!session.sources || session.sources.length === 0 ? (
              <p className="text-xs text-slate-500">No evidence sources collected yet.</p>
            ) : (
              session.sources.map((src: any) => (
                <div key={src.id} className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs flex items-center justify-between">
                  <div>
                    <div className="font-semibold text-white">{src.title}</div>
                    {src.url && (
                      <a href={src.url} target="_blank" rel="noreferrer" className="text-[11px] text-indigo-400 hover:underline">
                        {src.url}
                      </a>
                    )}
                  </div>
                  <div className="text-right text-[10px] text-slate-400">
                    <div>Quality: {Math.round((src.qualityScore || 0.5) * 100)}%</div>
                    <div>Type: {src.sourceType}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Follow-up Section */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 space-y-3">
        <h3 className="text-xs font-bold text-white">Ask Follow-Up Research Question</h3>
        <div className="flex space-x-2">
          <input
            type="text"
            value={followUpQuery}
            onChange={(e) => setFollowUpQuery(e.target.value)}
            placeholder="e.g. Compare pricing models and production operational costs..."
            className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
          />
          <button
            onClick={handleFollowUp}
            disabled={submittingFollowUp || !followUpQuery.trim()}
            className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold text-xs px-4 py-2.5 rounded-xl transition"
          >
            {submittingFollowUp ? 'Submitting...' : 'Investigate Follow-Up'}
          </button>
        </div>
      </div>
    </div>
  );
}
