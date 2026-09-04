'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useWorkspace } from '@/context/WorkspaceContext';

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

interface CollabChannel {
  id: string;
  name: string | null;
  type: 'DIRECT' | 'GROUP';
  members: Array<{ user: { id: string; name: string | null; email: string } }>;
}

export default function MockTestLibraryPage() {
  const { currentUser } = useWorkspace();
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

  // Delete State
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Share Modal State
  const [shareTargetTest, setShareTargetTest] = useState<MockTestCard | null>(null);
  const [channels, setChannels] = useState<CollabChannel[]>([]);
  const [selectedChannelId, setSelectedChannelId] = useState<string>('');
  const [shareMessage, setShareMessage] = useState('');
  const [isSharing, setIsSharing] = useState(false);

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

  const handleDeleteTest = async (testId: string) => {
    if (!confirm('Are you sure you want to delete this scheduled MCQ test? This action cannot be undone.')) return;
    setDeletingId(testId);

    try {
      const res = await fetch(`/api/mock-tests/${testId}`, {
        method: 'DELETE'
      });
      const data = await res.json();

      if (data.success) {
        setTests((prev) => prev.filter((t) => t.id !== testId));
      } else {
        alert(data.error || 'Failed to delete test');
      }
    } catch (err: any) {
      alert('Failed to delete test: ' + (err?.message || err));
    } finally {
      setDeletingId(null);
    }
  };

  const openShareModal = async (test: MockTestCard) => {
    setShareTargetTest(test);
    setShareMessage(`📝 Join my scheduled AI Mock Test: "${test.title}"!`);
    try {
      const res = await fetch('/api/collaboration/channels');
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) {
        setChannels(data.data);
        if (data.data.length > 0) setSelectedChannelId(data.data[0].id);
      }
    } catch (err) {
      console.error('Failed to load channels for sharing:', err);
    }
  };

  const handleExecuteShare = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shareTargetTest || !selectedChannelId) return;

    setIsSharing(true);
    try {
      const res = await fetch(`/api/mock-tests/${shareTargetTest.id}/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channelId: selectedChannelId,
          message: shareMessage
        })
      });
      const data = await res.json();

      if (data.success) {
        alert('🎉 Mock test shared successfully to chat channel!');
        setShareTargetTest(null);
      } else {
        alert(data.error || 'Failed to share test');
      }
    } catch {
      alert('Failed to connect server');
    } finally {
      setIsSharing(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground p-6 md:p-10">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-5">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-3" data-tour="mock-test-library-header">
              <span>📝 Centralized Mock Test & MCQ Library</span>
            </h1>
            <p className="text-muted-foreground text-sm mt-1">Discover, create, schedule, share, and review AI-generated multiple-choice assessment tests.</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                const future = new Date(Date.now() + 3600 * 1000);
                setNewScheduleTime(future.toISOString().slice(0, 16));
                setShowScheduleModal(true);
              }}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-foreground font-semibold text-xs rounded-xl shadow-md transition flex items-center gap-2"
              data-tour="schedule-test-modal-btn"
            >
              <span>➕ Schedule AI Mock Test</span>
            </button>
            <Link
              href="/collab-chat"
              className="px-4 py-2 bg-surface-hover hover:bg-muted text-foreground font-medium text-xs rounded-xl transition"
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
                    ? 'bg-emerald-600 text-foreground shadow-sm shadow-emerald-500/20'
                    : 'bg-surface text-muted-foreground hover:bg-surface-hover hover:text-foreground'
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
              className="px-3.5 py-1.5 bg-surface border border-border rounded-lg text-xs text-foreground focus:outline-none focus:border-emerald-500 w-64"
            />
            <button
              type="submit"
              className="px-3.5 py-1.5 bg-surface-hover hover:bg-muted text-foreground text-xs font-semibold rounded-lg transition"
            >
              Search
            </button>
          </form>
        </div>

        {/* Mock Test Cards Grid */}
        {loading && tests.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground text-sm">Loading mock tests library...</div>
        ) : tests.length === 0 ? (
          <div className="text-center py-20 bg-surface/50 rounded-2xl border border-border p-8">
            <div className="text-4xl mb-3">📝</div>
            <h3 className="text-foreground font-semibold mb-1">No mock tests found</h3>
            <p className="text-muted-foreground text-xs max-w-sm mx-auto mb-4">
              Schedule your first AI Mock Test using Gemini or search with different keywords.
            </p>
            <button
              onClick={() => setShowScheduleModal(true)}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-foreground text-xs font-semibold rounded-xl transition"
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
              const isCreator = currentUser?.id && test.createdById === currentUser.id;

              return (
                <div
                  key={test.id}
                  className="bg-surface/80 border border-border rounded-2xl p-5 flex flex-col justify-between hover:border-border transition shadow-sm space-y-4"
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
                            ? 'bg-surface-hover text-muted-foreground'
                            : 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30'
                        }`}
                      >
                        {isLive ? '🔴 LIVE NOW' : isCompleted ? '✅ COMPLETED' : isExpired ? '⏰ EXPIRED' : '📅 SCHEDULED'}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-muted-foreground font-mono">By {test.creatorName}</span>
                        {isCreator && (
                          <button
                            onClick={() => handleDeleteTest(test.id)}
                            disabled={deletingId === test.id}
                            className="p-1 rounded-lg text-rose-400 hover:text-rose-300 hover:bg-rose-950/40 transition text-xs"
                            title="Delete Task (Creator Only)"
                          >
                            {deletingId === test.id ? '⏳' : '🗑'}
                          </button>
                        )}
                      </div>
                    </div>

                    <h3 className="text-base font-bold text-foreground line-clamp-1">{test.title}</h3>
                    <p className="text-xs text-muted-foreground line-clamp-2">{test.topic || test.description || 'AI-generated MCQ Assessment'}</p>
                  </div>

                  <div className="space-y-3 pt-3 border-t border-border/80 text-xs">
                    <div className="grid grid-cols-2 gap-2 text-muted-foreground">
                      <div>⏱ {test.durationMinutes} Minutes</div>
                      <div>❓ {test.totalQuestions} Questions</div>
                      <div>👥 {test.participantCount} Participants</div>
                      {test.userScore !== null && test.userScore !== undefined && (
                        <div className="font-semibold text-emerald-400">Score: {test.userScore}%</div>
                      )}
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1">
                      <span>Starts: {new Date(test.scheduledStartTime).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                    </div>

                    <div className="flex items-center gap-2 pt-2">
                      <Link
                        href={`/study/mock-tests/${test.id}`}
                        className="flex-1 text-center px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-foreground font-semibold text-xs transition"
                      >
                        {isCompleted ? 'View Questions' : isLive ? 'Take Test Now' : 'View Test Details'}
                      </Link>
                      <button
                        onClick={() => openShareModal(test)}
                        className="px-2.5 py-2 rounded-xl bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-300 border border-indigo-500/30 text-xs transition font-semibold flex items-center gap-1"
                        title="Share with Friends / Channel"
                      >
                        <span>🔗 Share</span>
                      </button>
                      {test.googleCalendarLink && (
                        <a
                          href={test.googleCalendarLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-2.5 py-2 rounded-xl bg-surface-hover hover:bg-muted text-foreground text-xs transition"
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
              className="px-5 py-2.5 rounded-xl bg-surface-hover hover:bg-muted text-foreground text-xs font-semibold transition"
            >
              {loading ? 'Loading...' : 'Load More Tests'}
            </button>
          </div>
        )}

        {/* Schedule Test Modal */}
        {showScheduleModal && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 dark:bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-surface border border-border rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
              <div className="flex items-center justify-between border-b border-border pb-3">
                <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                  <span>📝 Schedule AI Mock Test</span>
                </h3>
                <button onClick={() => setShowScheduleModal(false)} className="text-muted-foreground hover:text-foreground font-bold text-sm">
                  ✕
                </button>
              </div>

              <form onSubmit={handleScheduleTest} className="space-y-4 text-xs">
                <div className="space-y-1">
                  <label className="text-foreground font-semibold">Test Title</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Distributed Systems & Microservices Quiz"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl bg-background border border-border text-foreground focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-foreground font-semibold">Topic / Domain</label>
                  <input
                    type="text"
                    placeholder="e.g. System Design & Data Structures"
                    value={newTopic}
                    onChange={(e) => setNewTopic(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl bg-background border border-border text-foreground focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-foreground font-semibold">Duration (Mins)</label>
                    <input
                      type="number"
                      min={5}
                      max={180}
                      value={newDuration}
                      onChange={(e) => setNewDuration(Number(e.target.value))}
                      className="w-full px-3.5 py-2 rounded-xl bg-background border border-border text-foreground focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-foreground font-semibold">Questions Count</label>
                    <input
                      type="number"
                      min={1}
                      max={50}
                      value={newQuestionsCount}
                      onChange={(e) => setNewQuestionsCount(Number(e.target.value))}
                      className="w-full px-3.5 py-2 rounded-xl bg-background border border-border text-foreground focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-foreground font-semibold">Scheduled Start Time</label>
                  <input
                    type="datetime-local"
                    required
                    value={newScheduleTime}
                    onChange={(e) => setNewScheduleTime(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl bg-background border border-border text-foreground focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="pt-3 border-t border-border flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowScheduleModal(false)}
                    className="px-4 py-2 rounded-xl bg-surface-hover text-foreground hover:bg-muted transition font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isCreating}
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-foreground font-semibold transition"
                  >
                    {isCreating ? 'Generating & Scheduling...' : 'Create AI Test'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Share Mock Test Modal */}
        {shareTargetTest && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 dark:bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-surface border border-border rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
              <div className="flex items-center justify-between border-b border-border pb-3">
                <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                  <span>🔗 Share Mock Test with Friend or Channel</span>
                </h3>
                <button onClick={() => setShareTargetTest(null)} className="text-muted-foreground hover:text-foreground font-bold text-sm">
                  ✕
                </button>
              </div>

              <form onSubmit={handleExecuteShare} className="space-y-4 text-xs">
                <div className="p-3 bg-background border border-border rounded-xl space-y-1">
                  <p className="font-bold text-foreground">{shareTargetTest.title}</p>
                  <p className="text-[11px] text-muted-foreground">
                    ⏱ {shareTargetTest.durationMinutes} mins • ❓ {shareTargetTest.totalQuestions} questions
                  </p>
                </div>

                <div className="space-y-1">
                  <label className="text-foreground font-semibold">Select Destination Channel / Direct Message</label>
                  {channels.length === 0 ? (
                    <p className="text-muted-foreground py-2 text-[11px]">No active channels found. Start a new DM or group in Collab Chat first!</p>
                  ) : (
                    <select
                      value={selectedChannelId}
                      onChange={(e) => setSelectedChannelId(e.target.value)}
                      className="w-full px-3.5 py-2 rounded-xl bg-background border border-border text-foreground focus:outline-none focus:border-indigo-500"
                    >
                      {channels.map((ch) => {
                        const name = ch.type === 'DIRECT'
                          ? `💬 DM with ${ch.members.map((m) => m.user.name || m.user.email.split('@')[0]).join(', ')}`
                          : `📢 Group: ${ch.name || 'Group'}`;
                        return (
                          <option key={ch.id} value={ch.id}>
                            {name}
                          </option>
                        );
                      })}
                    </select>
                  )}
                </div>

                <div className="space-y-1">
                  <label className="text-foreground font-semibold">Optional Note to Chat</label>
                  <input
                    type="text"
                    value={shareMessage}
                    onChange={(e) => setShareMessage(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl bg-background border border-border text-foreground focus:outline-none focus:border-indigo-500"
                    placeholder="e.g. Join this quiz with me!"
                  />
                </div>

                <div className="pt-3 border-t border-border flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShareTargetTest(null)}
                    className="px-4 py-2 rounded-xl bg-surface-hover text-foreground hover:bg-muted transition font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSharing || !selectedChannelId}
                    className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-foreground font-semibold transition"
                  >
                    {isSharing ? 'Sharing...' : 'Send to Chat 🚀'}
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
