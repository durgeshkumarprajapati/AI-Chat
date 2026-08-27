'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

type MeetingItem = {
  id: string;
  title: string;
  description?: string;
  meetingDate: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  sourceProvider: string;
  project?: { id: string; name: string } | null;
  analysis?: { summary: string; confidence: number } | null;
  taskSuggestions?: Array<{ id: string; status: string; title: string }>;
};

export default function MeetingsPage() {
  const [meetings, setMeetings] = useState<MeetingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [clickUpConnected, setClickUpConnected] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [creating, setCreating] = useState(false);

  const fetchMeetings = useCallback(async () => {
    try {
      const res = await fetch('/api/meetings');
      const json = await res.json();
      if (json.success) {
        setMeetings(json.data.meetings);
      }
    } catch (err) {
      console.error('Failed to fetch meetings:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchClickUpStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/integrations/clickup/status');
      const json = await res.json();
      if (json.success) {
        setClickUpConnected(json.data.connected);
      }
    } catch (err) {
      console.error('Failed to fetch ClickUp status:', err);
    }
  }, []);

  useEffect(() => {
    fetchMeetings();
    fetchClickUpStatus();
  }, [fetchMeetings, fetchClickUpStatus]);

  const handleCreateMeeting = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    setCreating(true);
    try {
      const res = await fetch('/api/meetings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle, description: newDescription })
      });
      const json = await res.json();
      if (json.success) {
        setNewTitle('');
        setNewDescription('');
        setIsCreateModalOpen(false);
        fetchMeetings();
      }
    } catch (err) {
      console.error('Failed to create meeting:', err);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-xl">
        <div>
          <h1 className="text-2xl font-extrabold text-white flex items-center gap-2">
            🎙️ AI Meeting Intelligence
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Analyze meeting transcripts, extract key decisions & risks, and safely push human-approved tasks to ClickUp.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <a
            href={clickUpConnected ? '#' : '/api/integrations/clickup/connect'}
            className={`px-4 py-2.5 rounded-xl font-semibold text-xs transition-colors flex items-center gap-2 border ${
              clickUpConnected
                ? 'bg-emerald-950 border-emerald-800 text-emerald-300'
                : 'bg-purple-600 hover:bg-purple-500 border-purple-500 text-white'
            }`}
          >
            {clickUpConnected ? '✓ ClickUp Connected' : '🔗 Connect ClickUp'}
          </a>

          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all shadow-lg shadow-indigo-600/20"
          >
            + New Meeting
          </button>
        </div>
      </div>

      {/* Meeting Cards List */}
      {loading ? (
        <div className="p-12 text-center text-slate-500 animate-pulse">Loading meetings...</div>
      ) : meetings.length === 0 ? (
        <div className="p-12 text-center rounded-2xl bg-slate-900/50 border border-slate-800 space-y-3">
          <span className="text-3xl block">📋</span>
          <h3 className="text-base font-bold text-slate-200">No Meetings Found</h3>
          <p className="text-xs text-slate-400">Create a meeting and paste a transcript to run AI analysis.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {meetings.map((m) => (
            <Link key={m.id} href={`/meetings/${m.id}`}>
              <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 hover:border-indigo-500/50 transition-all space-y-3 shadow-lg group">
                <div className="flex items-start justify-between">
                  <h3 className="font-bold text-white text-sm group-hover:text-indigo-400 transition-colors">
                    {m.title}
                  </h3>
                  <span
                    className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                      m.status === 'COMPLETED'
                        ? 'bg-emerald-950 border border-emerald-800 text-emerald-400'
                        : m.status === 'PROCESSING'
                        ? 'bg-blue-950 border border-blue-800 text-blue-400 animate-pulse'
                        : m.status === 'FAILED'
                        ? 'bg-rose-950 border border-rose-800 text-rose-400'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {m.status}
                  </span>
                </div>

                <p className="text-xs text-slate-400 line-clamp-2">
                  {m.analysis?.summary || m.description || 'No summary generated yet.'}
                </p>

                <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-500">
                  <span>📅 {new Date(m.meetingDate).toLocaleDateString()}</span>
                  <span>📌 {m.taskSuggestions?.length || 0} Action Items</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Create Meeting Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <form
            onSubmit={handleCreateMeeting}
            className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-md space-y-4 shadow-2xl"
          >
            <h3 className="text-lg font-bold text-white">Create New Meeting</h3>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-400">Meeting Title</label>
              <input
                type="text"
                required
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="e.g. Q3 Product Architecture Review"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-400">Description (Optional)</label>
              <textarea
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="Brief summary or objective"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-500 h-20"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-xs font-semibold text-slate-300 hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={creating}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white disabled:opacity-50"
              >
                {creating ? 'Creating...' : 'Create Meeting'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
