'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { AppLayout } from '@/components/layout/AppLayout';
import { VoiceTutorSessionDTO } from '@/features/voice-tutor/voice-tutor.types';

export default function VoiceTutorHistoryPage() {
  const [sessions, setSessions] = useState<VoiceTutorSessionDTO[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchHistory = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/study/voice-tutor/sessions?limit=30');
      const data = await res.json();
      if (data.success) {
        setSessions(data.data || []);
      }
    } catch (err) {
      console.error('[VoiceHistory] Error loading history:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this voice tutoring session?')) return;
    try {
      await fetch(`/api/study/voice-tutor/sessions/${id}`, { method: 'DELETE' });
      fetchHistory();
    } catch (err) {
      console.error('[VoiceHistory] Delete error:', err);
    }
  };

  return (
    <AppLayout>
      <div className="p-4 sm:p-6 lg:p-8 max-w-[1400px] mx-auto space-y-8 w-full font-sans">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
          <div>
            <div className="flex items-center space-x-3">
              <span className="text-3xl">📜</span>
              <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">Voice Tutor Session History</h1>
            </div>
            <p className="text-xs sm:text-sm text-slate-400 mt-1">
              Review your past interactive AI Voice Tutoring conversations, duration, and performance scores.
            </p>
          </div>

          <Link
            href="/study/voice-tutor"
            className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs transition shadow-lg shadow-indigo-600/20 flex items-center justify-center space-x-2 self-start sm:self-auto"
          >
            <span>+ Start New Session</span>
          </Link>
        </div>

        {/* History List Table / Cards */}
        {loading ? (
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-12 text-center text-xs text-slate-400 font-mono">
            Loading session history...
          </div>
        ) : sessions.length === 0 ? (
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-12 text-center space-y-4 max-w-md mx-auto">
            <span className="text-4xl">🎙️</span>
            <div className="space-y-1">
              <h3 className="text-base font-bold text-white">No Voice Tutoring Sessions Yet</h3>
              <p className="text-xs text-slate-400">Start your first interactive AI voice conversation to build your learning history.</p>
            </div>
            <Link
              href="/study/voice-tutor"
              className="inline-block px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-indigo-600/30 transition"
            >
              Start First Voice Session 🎤
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {sessions.map((s) => {
              const minutes = Math.max(1, Math.round(s.durationSeconds / 60));
              return (
                <div
                  key={s.id}
                  className="bg-slate-900/90 border border-slate-800 hover:border-slate-700 rounded-3xl p-5 space-y-4 shadow-xl transition flex flex-col justify-between"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-mono text-indigo-400 bg-indigo-950/80 px-2.5 py-0.5 rounded-full border border-indigo-800">
                        {s.mode}
                      </span>
                      <span
                        className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded ${
                          s.status === 'COMPLETED'
                            ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                            : 'bg-amber-950 text-amber-400 border border-amber-800'
                        }`}
                      >
                        {s.status}
                      </span>
                    </div>

                    <h3 className="text-sm font-bold text-white line-clamp-1">{s.title}</h3>
                    <p className="text-xs text-slate-400 font-mono">
                      Started: {new Date(s.startedAt).toLocaleDateString()} at {new Date(s.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[11px] font-mono bg-slate-950 p-3 rounded-2xl border border-slate-850">
                    <div>
                      <span className="text-slate-500 block text-[9px] uppercase">Duration</span>
                      <span className="text-slate-200 font-bold">{minutes} mins</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[9px] uppercase">Messages</span>
                      <span className="text-slate-200 font-bold">{s.totalMessages} turns</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-800/80">
                    <Link
                      href="/study/voice-tutor"
                      className="text-xs font-bold text-indigo-400 hover:text-indigo-300 transition"
                    >
                      Open Session →
                    </Link>

                    <button
                      onClick={() => handleDelete(s.id)}
                      className="text-xs text-rose-400 hover:text-rose-300 p-1 transition"
                      title="Delete Session"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
