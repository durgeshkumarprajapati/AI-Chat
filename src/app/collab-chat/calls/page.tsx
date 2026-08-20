'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';

interface CallItem {
  id: string;
  channelId: string;
  channelName?: string | null;
  isGroup: boolean;
  hostId: string;
  hostName: string;
  hostAvatarUrl?: string | null;
  type: 'VOICE' | 'VIDEO';
  status: string;
  outcome: 'COMPLETED' | 'MISSED' | 'DECLINED' | 'CANCELLED' | 'FAILED';
  startedAt?: string | null;
  endedAt?: string | null;
  durationSeconds: number;
  formattedDuration: string;
  createdAt: string;
  participantCount: number;
}

export default function CallHistoryPage() {
  const [calls, setCalls] = useState<CallItem[]>([]);
  const [filterTab, setFilterTab] = useState<'ALL' | 'MISSED' | 'VOICE' | 'VIDEO' | 'GROUP' | 'DIRECT'>('ALL');
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [missedCount, setMissedCount] = useState(0);

  useEffect(() => {
    fetchCallHistory(1, filterTab);
    fetchMissedCount();
  }, [filterTab]);

  const fetchMissedCount = async () => {
    try {
      const res = await fetch('/api/collaboration/calls/missed-count');
      const data = await res.json();
      if (data.success) {
        setMissedCount(data.count || 0);
      }
    } catch {}
  };

  const fetchCallHistory = async (pageNum: number, filter: string) => {
    setLoading(true);
    try {
      let query = `/api/collaboration/calls/history?page=${pageNum}&limit=20`;
      if (filter === 'MISSED') query += '&status=MISSED';
      else if (filter === 'VOICE' || filter === 'VIDEO') query += `&type=${filter}`;

      const res = await fetch(query);
      const json = await res.json();

      if (json.success) {
        let items: CallItem[] = json.data || [];
        if (filter === 'GROUP') items = items.filter((c) => c.isGroup);
        else if (filter === 'DIRECT') items = items.filter((c) => !c.isGroup);

        setCalls(pageNum === 1 ? items : [...calls, ...items]);
        setHasMore(json.meta?.hasMore || false);
        setPage(pageNum);
      }
    } catch (err) {
      console.error('Failed to load call history:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCallBack = async (channelId: string, type: 'VOICE' | 'VIDEO') => {
    try {
      const res = await fetch('/api/collaboration/calls/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId, type })
      });
      const data = await res.json();
      if (data.success) {
        window.location.href = `/collab-chat?channel=${channelId}&callId=${data.call.id}`;
      } else {
        alert(data.error || 'Failed to initiate call');
      }
    } catch {
      alert('Failed to connect call');
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 md:p-10">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header Bar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-3" data-tour="call-history-header">
              <span>📞 Call History</span>
              {missedCount > 0 && (
                <span className="bg-rose-500/20 text-rose-400 text-xs px-2.5 py-1 rounded-full font-semibold border border-rose-500/30">
                  {missedCount} Missed
                </span>
              )}
            </h1>
            <p className="text-slate-400 text-sm mt-1">Review past voice and video call logs, missed calls, and duration metrics.</p>
          </div>
          <Link
            href="/collab-chat"
            className="inline-flex items-center px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium transition"
          >
            ← Back to Chat
          </Link>
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2 border-b border-slate-800/60" data-tour="call-history-filters">
          {[
            { id: 'ALL', label: 'All Calls' },
            { id: 'MISSED', label: 'Missed' },
            { id: 'VOICE', label: 'Voice' },
            { id: 'VIDEO', label: 'Video' },
            { id: 'GROUP', label: 'Group' },
            { id: 'DIRECT', label: '1-to-1' }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilterTab(tab.id as any)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition ${
                filterTab === tab.id
                  ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/20'
                  : 'bg-slate-900 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Call Cards List */}
        {loading && calls.length === 0 ? (
          <div className="text-center py-16 text-slate-500 text-sm">Loading call logs...</div>
        ) : calls.length === 0 ? (
          <div className="text-center py-16 bg-slate-900/50 rounded-xl border border-slate-800/80 p-8">
            <div className="text-4xl mb-3">📞</div>
            <h3 className="text-slate-300 font-semibold mb-1">No call history found</h3>
            <p className="text-slate-500 text-xs max-w-sm mx-auto">
              Initiate voice or video calls inside your DM and Group channels to start logging history.
            </p>
          </div>
        ) : (
          <div className="space-y-3" data-tour="call-history-list">
            {calls.map((call) => {
              const isMissed = call.outcome === 'MISSED';
              const isDeclined = call.outcome === 'DECLINED';
              const isVideo = call.type === 'VIDEO';

              return (
                <div
                  key={call.id}
                  className={`flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl border transition ${
                    isMissed
                      ? 'bg-rose-950/10 border-rose-900/30 hover:border-rose-700/40'
                      : 'bg-slate-900/70 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-3.5">
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold ${
                        isVideo ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                      }`}
                    >
                      {isVideo ? '📹' : '📞'}
                    </div>

                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-200 text-sm">
                          {call.isGroup ? call.channelName || 'Group Call' : call.hostName}
                        </span>
                        {call.isGroup && (
                          <span className="bg-slate-800 text-slate-400 text-[10px] px-2 py-0.5 rounded font-medium">
                            {call.participantCount} members
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-slate-400 mt-1">
                        <span>{new Date(call.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        <span>•</span>
                        <span
                          className={`font-medium ${
                            isMissed ? 'text-rose-400 font-semibold' : isDeclined ? 'text-amber-400' : 'text-slate-300'
                          }`}
                        >
                          {call.formattedDuration}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 mt-3 sm:mt-0">
                    <button
                      onClick={() => handleCallBack(call.channelId, call.type)}
                      className="px-3 py-1.5 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 text-xs font-semibold border border-blue-500/30 transition flex items-center gap-1.5"
                    >
                      <span>{isVideo ? '📹 Call Back' : '📞 Call Back'}</span>
                    </button>
                    <Link
                      href={`/collab-chat?channel=${call.channelId}`}
                      className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition"
                    >
                      Open Chat
                    </Link>
                  </div>
                </div>
              );
            })}

            {hasMore && (
              <div className="text-center pt-4">
                <button
                  onClick={() => fetchCallHistory(page + 1, filterTab)}
                  disabled={loading}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition"
                >
                  {loading ? 'Loading...' : 'Load More Calls'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
