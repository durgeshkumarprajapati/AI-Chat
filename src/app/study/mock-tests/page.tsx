'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';

interface MockTestCard {
  id: string;
  createdById: string;
  creatorName: string;
  title: string;
  description?: string | null;
  topic?: string | null;
  scheduledStartTime: string;
  durationMinutes: number;
  totalQuestions: number;
  status: string;
  googleCalendarLink?: string | null;
  participantCount: number;
  userParticipantStatus?: string | null;
  userScore?: number | null;
  userPassed?: boolean | null;
  createdAt: string;
}

export default function MockTestLibraryPage() {
  const [tests, setTests] = useState<MockTestCard[]>([]);
  const [activeTab, setActiveTab] = useState<'ALL' | 'SCHEDULED' | 'LIVE' | 'COMPLETED' | 'EXPIRED' | 'SHARED'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  // New Test Modal state
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newTopic, setNewTopic] = useState('');
  const [newDuration, setNewDuration] = useState(30);
  const [newQuestionsCount, setNewQuestionsCount] = useState(10);
  const [newScheduleTime, setNewScheduleTime] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    fetchTests(1, activeTab, searchQuery);
  }, [activeTab]);

  const fetchTests = async (pageNum: number, tab: string, search: string) => {
    setLoading(true);
    try {
      let query = `/api/mock-tests?page=${pageNum}&limit=12`;
      if (tab !== 'ALL') query += `&status=${tab}`;
      if (search.trim()) query += `&search=${encodeURIComponent(search.trim())}`;

      const res = await fetch(query);
      const data = await res.json();

      if (data.success) {
        setTests(pageNum === 1 ? data.data || [] : [...tests, ...(data.data || [])]);
        setHasMore(data.meta?.hasMore || false);
        setPage(pageNum);
      }
    } catch (err) {
      console.error('Failed to fetch mock test library:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchTests(1, activeTab, searchQuery);
  };

  const handleScheduleTest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newScheduleTime) {
      alert('Please fill in title and scheduled start time');
      return;
    }

    setIsCreating(true);
    try {
      const res = await fetch('/api/study/mock-tests/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newTitle,
          topic: newTopic || 'General Software Engineering',
          scheduledStartTime: new Date(newScheduleTime).toISOString(),
          durationMinutes: newDuration,
          totalQuestions: newQuestionsCount
        })
      });

      const data = await res.json();
      if (data.success) {
        setShowScheduleModal(false);
        setNewTitle('');
        setNewTopic('');
        fetchTests(1, activeTab, searchQuery);
      } else {
        alert(data.error || 'Failed to schedule test');
      }
    } catch {
      alert('Failed to connect server');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 md:p-10">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-3" data-tour="mock-test-library-header">
              <span>📝 Centralized Mock Test & MCQ Library</span>
            </h1>
            <p className="text-slate-400 text-sm mt-1">Discover, create, schedule, and review AI-generated multiple-choice assessment tests.</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                const future = new Date(Date.now() + 3600 * 1000);
                setNewScheduleTime(future.toISOString().slice(0, 16));
                setShowScheduleModal(true);
              }}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs rounded-xl shadow-md transition flex items-center gap-2"
              data-tour="schedule-test-modal-btn"
            >
              <span>➕ Schedule AI Mock Test</span>
            </button>
            <Link
              href="/collab-chat"
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium text-xs rounded-xl transition"
            >
              Collab Chat
            </Link>
          </div>
        </div>

        {/* Search & Tabs Controls */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* Tabs */}
          <div className="flex items-center gap-2 overflow-x-auto pb-2" data-tour="mock-test-tabs">
            {[
              { id: 'ALL', label: 'All Tests' },
              { id: 'SCHEDULED', label: 'Scheduled' },
              { id: 'LIVE', label: 'Live Now' },
              { id: 'COMPLETED', label: 'Completed' },
              { id: 'EXPIRED', label: 'Expired' },
              { id: 'SHARED', label: 'Shared' }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition ${
                  activeTab === tab.id
                    ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-500/20'
                    : 'bg-slate-900 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Search Box */}
          <form onSubmit={handleSearchSubmit} className="flex items-center gap-2" data-tour="mock-test-search">
            <input
              type="text"
              placeholder="Search tests by title or topic..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="px-3.5 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-emerald-500 w-64"
            />
            <button
              type="submit"
              className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg transition"
            >
              Search
            </button>
          </form>
        </div>

        {/* Mock Test Cards Grid */}
        {loading && tests.length === 0 ? (
          <div className="text-center py-20 text-slate-500 text-sm">Loading mock tests library...</div>
        ) : tests.length === 0 ? (
          <div className="text-center py-20 bg-slate-900/50 rounded-2xl border border-slate-800 p-8">
            <div className="text-4xl mb-3">📝</div>
            <h3 className="text-slate-300 font-semibold mb-1">No mock tests found</h3>
            <p className="text-slate-500 text-xs max-w-sm mx-auto mb-4">
              Schedule your first AI Mock Test using Gemini or search with different keywords.
            </p>
            <button
              onClick={() => setShowScheduleModal(true)}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl transition"
            >
              Create New Test
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" data-tour="mock-test-cards-grid">
            {tests.map((test) => {
              const isLive = test.status === 'IN_PROGRESS';
              const isCompleted = test.status === 'COMPLETED' || Boolean(test.userParticipantStatus === 'SUBMITTED');
              const isExpired = test.status === 'EXPIRED';

              return (
                <div
                  key={test.id}
                  className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 flex flex-col justify-between hover:border-slate-700 transition shadow-sm space-y-4"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span
                        className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase ${
                          isLive
                            ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30 animate-pulse'
                            : isCompleted
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                            : isExpired
                            ? 'bg-slate-800 text-slate-400'
                            : 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30'
                        }`}
                      >
                        {isLive ? '🔴 LIVE NOW' : isCompleted ? '✅ COMPLETED' : isExpired ? '⏰ EXPIRED' : '📅 SCHEDULED'}
                      </span>
                      <span className="text-[11px] text-slate-500 font-mono">By {test.creatorName}</span>
                    </div>

                    <h3 className="text-base font-bold text-slate-100 line-clamp-1">{test.title}</h3>
                    <p className="text-xs text-slate-400 line-clamp-2">{test.topic || test.description || 'AI-generated MCQ Assessment'}</p>
                  </div>

                  <div className="space-y-3 pt-3 border-t border-slate-800/80 text-xs">
                    <div className="grid grid-cols-2 gap-2 text-slate-400">
                      <div>⏱ {test.durationMinutes} Minutes</div>
                      <div>❓ {test.totalQuestions} Questions</div>
                      <div>👥 {test.participantCount} Participants</div>
                      {test.userScore !== null && test.userScore !== undefined && (
                        <div className="font-semibold text-emerald-400">Score: {test.userScore}%</div>
                      )}
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
                      <span>Starts: {new Date(test.scheduledStartTime).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                    </div>

                    <div className="flex items-center gap-2 pt-2">
                      <Link
                        href={`/study/mock-tests/${test.id}`}
                        className="flex-1 text-center px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition"
                      >
                        {isCompleted ? 'View Questions' : isLive ? 'Take Test Now' : 'View Test Details'}
                      </Link>
                      {test.googleCalendarLink && (
                        <a
                          href={test.googleCalendarLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-2.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition"
                          title="Add to Google Calendar"
                        >
                          📅
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {hasMore && (
          <div className="text-center pt-6">
            <button
              onClick={() => fetchTests(page + 1, activeTab, searchQuery)}
              disabled={loading}
              className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition"
            >
              {loading ? 'Loading...' : 'Load More Tests'}
            </button>
          </div>
        )}

        {/* Schedule Test Modal */}
        {showScheduleModal && (
          <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <span>📝 Schedule AI Mock Test</span>
                </h3>
                <button onClick={() => setShowScheduleModal(false)} className="text-slate-400 hover:text-white font-bold text-sm">
                  ✕
                </button>
              </div>

              <form onSubmit={handleScheduleTest} className="space-y-3.5 text-xs">
                <div>
                  <label className="block text-slate-400 mb-1 font-semibold">Test Title *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Distributed Systems Architecture Exam"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1 font-semibold">Topic / Subject</label>
                  <input
                    type="text"
                    placeholder="e.g. Kubernetes, React Hooks, System Design"
                    value={newTopic}
                    onChange={(e) => setNewTopic(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-400 mb-1 font-semibold">Duration (Mins)</label>
                    <input
                      type="number"
                      min={5}
                      max={180}
                      value={newDuration}
                      onChange={(e) => setNewDuration(parseInt(e.target.value, 10) || 30)}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1 font-semibold">Questions Count</label>
                    <input
                      type="number"
                      min={1}
                      max={50}
                      value={newQuestionsCount}
                      onChange={(e) => setNewQuestionsCount(parseInt(e.target.value, 10) || 10)}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1 font-semibold">Scheduled Start Time *</label>
                  <input
                    type="datetime-local"
                    required
                    value={newScheduleTime}
                    onChange={(e) => setNewScheduleTime(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setShowScheduleModal(false)}
                    className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isCreating}
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold transition"
                  >
                    {isCreating ? 'Generating Test...' : 'Generate & Schedule'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
