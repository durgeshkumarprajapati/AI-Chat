'use client';

import React, { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useWorkspace } from '@/context/WorkspaceContext';

interface QuestionOption {
  id: string;
  optionText: string;
  isCorrect?: boolean;
}

interface QuestionItem {
  id: string;
  questionText: string;
  type: string;
  options: QuestionOption[];
  correctOptionId?: string;
  explanation?: string;
  groundingSource?: string;
}

interface CollabChannel {
  id: string;
  name: string | null;
  type: 'DIRECT' | 'GROUP';
  members: Array<{ user: { id: string; name: string | null; email: string } }>;
}

export default function MockTestDetailPage({ params }: { params: { id: string } | Promise<{ id: string }> }) {
  const router = useRouter();
  const { currentUser } = useWorkspace();
  const unwrappedParams = typeof (params as any)?.then === 'function' ? use(params as Promise<{ id: string }>) : (params as { id: string });
  const testId = unwrappedParams.id;
  const [test, setTest] = useState<any>(null);
  const [questions, setQuestions] = useState<QuestionItem[]>([]);
  const [isSanitized, setIsSanitized] = useState(false);
  const [userParticipant, setUserParticipant] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Active quiz session state
  const [isTakingTest, setIsTakingTest] = useState(false);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, string[]>>({});
  const [submitting, setSubmitting] = useState(false);
  const [scoreResult, setScoreResult] = useState<any>(null);

  // Delete State
  const [isDeleting, setIsDeleting] = useState(false);
  const [isRetryingCalendar, setIsRetryingCalendar] = useState(false);

  // Share Modal State
  const [showShareModal, setShowShareModal] = useState(false);
  const [channels, setChannels] = useState<CollabChannel[]>([]);
  const [selectedChannelId, setSelectedChannelId] = useState<string>('');
  const [shareMessage, setShareMessage] = useState('');
  const [isSharing, setIsSharing] = useState(false);

  useEffect(() => {
    fetchTestDetails();
    fetchTestQuestions();
  }, [testId]);

  const fetchTestDetails = async () => {
    try {
      const res = await fetch(`/api/mock-tests/${testId}`);
      const data = await res.json();
      if (data.success) {
        setTest(data.test);
        setUserParticipant(data.userParticipant);
      }
    } catch (err) {
      console.error('Failed to fetch test details:', err);
    }
  };

  const fetchTestQuestions = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/mock-tests/${testId}/questions`);
      const data = await res.json();
      if (data.success) {
        setQuestions(data.questions || []);
        setIsSanitized(Boolean(data.isSanitized));
      }
    } catch (err) {
      console.error('Failed to fetch test questions:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteTest = async () => {
    if (!confirm('Are you sure you want to delete this scheduled MCQ test? This action cannot be undone.')) return;
    setIsDeleting(true);

    try {
      const res = await fetch(`/api/mock-tests/${testId}`, {
        method: 'DELETE'
      });
      const data = await res.json();

      if (data.success) {
        router.push('/study/mock-tests');
      } else {
        alert(data.error || 'Failed to delete test');
      }
    } catch (err: any) {
      alert('Failed to delete test: ' + (err?.message || err));
    } finally {
      setIsDeleting(false);
    }
  };

  const handleRetryCalendarSync = async () => {
    setIsRetryingCalendar(true);
    try {
      const res = await fetch(`/api/mock-tests/${testId}/calendar/retry`, {
        method: 'POST'
      });
      const data = await res.json();
      if (data.success) {
        fetchTestDetails();
      } else {
        alert(data.error || 'Failed to retry Google Calendar sync');
      }
    } catch {
      alert('Failed to connect server');
    } finally {
      setIsRetryingCalendar(false);
    }
  };

  const openShareModal = async () => {
    setShowShareModal(true);
    setShareMessage(`📝 Join my scheduled AI Mock Test: "${test?.title || 'MCQ Quiz'}"!`);
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
    if (!selectedChannelId) return;

    setIsSharing(true);
    try {
      const res = await fetch(`/api/mock-tests/${testId}/share`, {
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
        setShowShareModal(false);
      } else {
        alert(data.error || 'Failed to share test');
      }
    } catch {
      alert('Failed to connect server');
    } finally {
      setIsSharing(false);
    }
  };

  const handleStartSession = async () => {
    try {
      const res = await fetch(`/api/mock-tests/${testId}/session`, {
        method: 'POST'
      });
      const data = await res.json();
      if (data.success) {
        setQuestions(data.questions || []);
        setIsTakingTest(true);
      } else {
        alert(data.error || 'Failed to start session');
      }
    } catch {
      alert('Failed to connect server');
    }
  };

  const handleOptionSelect = (qId: string, optId: string) => {
    setSelectedAnswers((prev) => ({
      ...prev,
      [qId]: [optId]
    }));
  };

  const handleSubmitTest = async () => {
    setSubmitting(true);
    try {
      const payloadAnswers = questions.map((q, idx) => {
        const selectedOptId = selectedAnswers[q.id]?.[0];
        const optIdx = q.options.findIndex((o) => o.id === selectedOptId);
        return {
          questionIndex: idx,
          selectedOptionIndex: optIdx >= 0 ? optIdx : 0
        };
      });

      const res = await fetch(`/api/mock-tests/${testId}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers: payloadAnswers })
      });
      const data = await res.json();

      if (data.success) {
        setScoreResult(data.scoreResult);
        setIsTakingTest(false);
        fetchTestQuestions();
      } else {
        alert(data.error || 'Failed to submit test');
      }
    } catch {
      alert('Failed to submit test');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading && !test) {
    return <div className="min-h-screen bg-background text-muted-foreground p-10 text-center">Loading mock test...</div>;
  }

  if (!test) {
    return <div className="min-h-screen bg-background text-rose-400 p-10 text-center">Mock test not found</div>;
  }

  const isCompleted = test.status === 'COMPLETED' || Boolean(userParticipant?.submittedAt);
  const isCreator = currentUser?.id && test.createdById === currentUser.id;

  return (
    <div className="min-h-screen bg-background text-foreground p-6 md:p-10">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-5">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs px-2.5 py-0.5 rounded-full font-bold uppercase bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                {test.status}
              </span>
              <span className="text-xs text-muted-foreground">Created by {test.createdBy?.name || 'Instructor'}</span>
            </div>
            <h1 className="text-2xl font-bold text-foreground">{test.title}</h1>
            <p className="text-xs text-muted-foreground mt-1">{test.topic || test.description || 'AI MCQ Assessment'}</p>
          </div>

          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
            <Link
              href="/study/mock-tests"
              className="px-3.5 py-2 bg-surface-hover hover:bg-muted text-foreground text-xs font-semibold rounded-xl transition"
            >
              ← Back
            </Link>
            <button
              onClick={openShareModal}
              className="px-3.5 py-2 bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-300 border border-indigo-500/30 text-xs font-semibold rounded-xl transition flex items-center gap-1"
            >
              <span>🔗 Share</span>
            </button>
            {isCreator && (
              <button
                onClick={handleDeleteTest}
                disabled={isDeleting}
                className="px-3.5 py-2 bg-rose-600/20 hover:bg-rose-600/40 text-rose-300 border border-rose-500/30 text-xs font-semibold rounded-xl transition"
                title="Delete Test (Creator Only)"
              >
                {isDeleting ? 'Deleting...' : '🗑 Delete'}
              </button>
            )}
            {!isTakingTest && !isCompleted && (
              <button
                onClick={handleStartSession}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-foreground text-xs font-bold rounded-xl shadow-md transition"
              >
                🚀 Take Test Now
              </button>
            )}
          </div>
        </div>

        {/* Share Modal */}
        {showShareModal && (
          <div className="fixed inset-0 bg-slate-900/60 dark:bg-black/70 z-50 flex items-center justify-center p-4">
            <div className="bg-surface border border-border p-6 rounded-2xl w-full max-w-sm space-y-4">
              <h3 className="font-bold text-foreground">Share Mock Test</h3>
              <form onSubmit={handleExecuteShare} className="space-y-4">
                <select
                  className="w-full bg-surface-hover text-xs p-2.5 rounded-lg border border-border"
                  value={selectedChannelId}
                  onChange={(e) => setSelectedChannelId(e.target.value)}
                >
                  {channels.map((c) => <option key={c.id} value={c.id}>{c.name || 'Channel'}</option>)}
                </select>
                <textarea
                  className="w-full bg-surface-hover text-xs p-2.5 rounded-lg border border-border"
                  value={shareMessage}
                  onChange={(e) => setShareMessage(e.target.value)}
                />
                <div className="flex gap-2">
                  <button type="button" onClick={() => setShowShareModal(false)} className="flex-1 text-xs py-2">Cancel</button>
                  <button type="submit" disabled={isSharing} className="flex-1 bg-indigo-600 text-xs font-bold py-2 rounded-lg">
                    {isSharing ? 'Sending...' : 'Send to Chat'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Google Calendar Integration Diagnostic Banner */}
        {test.googleCalendarSyncStatus === 'SYNCED' || test.googleCalendarEventUrl ? (
          <div className="p-4 bg-emerald-950/40 border border-emerald-500/30 rounded-2xl flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="text-emerald-300 font-semibold flex items-center gap-2">
              <span>✓ Added to Google Calendar</span>
            </span>
            <a
              href={test.googleCalendarEventUrl || test.googleCalendarLink}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-foreground font-bold rounded-xl transition"
            >
              Open in Google Calendar ↗
            </a>
          </div>
        ) : test.googleCalendarSyncStatus === 'NOT_CONNECTED' ? (
          <div className="p-4 bg-amber-950/40 border border-amber-500/30 rounded-2xl flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="text-amber-300 font-semibold flex items-center gap-2">
              <span>⚠ Google Calendar not connected</span>
            </span>
            <a
              href="/api/integrations/google/connect"
              className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-500 text-foreground font-bold rounded-xl transition"
            >
              Connect Google Calendar
            </a>
          </div>
        ) : test.googleCalendarSyncError &&
          (test.googleCalendarSyncError.includes('SCOPE_REQUIRED') || test.googleCalendarSyncError.includes('PERMISSION_DENIED')) ? (
          <div className="p-4 bg-amber-950/40 border border-amber-500/30 rounded-2xl flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="text-amber-300 font-semibold flex items-center gap-2">
              <span>⚠ Google Calendar permission required</span>
            </span>
            <a
              href="/api/integrations/google/connect"
              className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-500 text-foreground font-bold rounded-xl transition"
            >
              Reconnect Google Calendar
            </a>
          </div>
        ) : (
          <div className="p-4 bg-rose-950/40 border border-rose-500/30 rounded-2xl flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="space-y-0.5">
              <span className="text-rose-300 font-semibold flex items-center gap-2">
                <span>⚠ Google Calendar event creation failed</span>
              </span>
              {test.googleCalendarSyncError && (
                <p className="text-[11px] text-rose-400/80">{test.googleCalendarSyncError}</p>
              )}
            </div>
            <button
              onClick={handleRetryCalendarSync}
              disabled={isRetryingCalendar}
              className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-500 text-foreground font-bold rounded-xl transition"
            >
              {isRetryingCalendar ? 'Retrying...' : 'Retry Sync'}
            </button>
          </div>
        )}

        {/* Score Summary Banner if completed */}
        {(isCompleted || scoreResult) && (
          <div className="p-5 bg-gradient-to-r from-emerald-950/60 to-slate-900 border border-emerald-500/30 rounded-2xl flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-emerald-400">Quiz Submitted & Evaluated</h3>
              <p className="text-xs text-foreground mt-0.5">
                Score: <span className="font-bold text-foreground">{scoreResult?.scorePercentage || userParticipant?.score || 100}%</span> •{' '}
                {scoreResult?.passed || userParticipant?.passed ? 'PASSED ✅' : 'NEEDS IMPROVEMENT ⚠'}
              </p>
            </div>
            <div className="text-2xl">🏆</div>
          </div>
        )}

        {/* Active Quiz Taking Session */}
        {isTakingTest ? (
          <div className="bg-surface border border-border rounded-2xl p-6 space-y-6">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="text-base font-bold text-foreground">Active Test Session</h3>
              <span className="text-xs text-amber-400 font-mono font-semibold">⏱ Time Remaining: Server Authoritative</span>
            </div>

            <div className="space-y-6">
              {questions.map((q, idx) => (
                <div key={q.id || `q_${idx}`} className="p-4 rounded-xl bg-background border border-border space-y-3">
                  <h4 className="text-sm font-bold text-foreground">
                    Q{idx + 1}. {q.questionText || (q as any).question || 'Question unavailable'}
                  </h4>
                  <div className="space-y-2">
                    {q.options?.map((opt, oIdx) => {
                      const optText = opt.optionText || (opt as any).text || (typeof opt === 'string' ? opt : `Option ${oIdx + 1}`);
                      const isSelected = selectedAnswers[q.id]?.includes(opt.id);
                      return (
                        <button
                          key={opt.id || `opt_${oIdx}`}
                          type="button"
                          onClick={() => handleOptionSelect(q.id, opt.id)}
                          className={`w-full text-left p-3 rounded-lg text-xs transition border ${
                            isSelected
                              ? 'bg-emerald-600/20 border-emerald-500 text-emerald-300 font-semibold'
                              : 'bg-surface border-border text-foreground hover:bg-surface-hover'
                          }`}
                        >
                          {optText}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-4 border-t border-border flex justify-end">
              <button
                onClick={handleSubmitTest}
                disabled={submitting}
                className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-foreground font-bold text-xs rounded-xl transition"
              >
                {submitting ? 'Submitting...' : 'Submit Answers Now'}
              </button>
            </div>
          </div>
        ) : (
          /* Question Bank Inspector View */
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-foreground">Question Bank Inspector ({questions.length} MCQs)</h3>
              {isSanitized && (
                <span className="text-[11px] text-amber-400 font-mono bg-amber-500/10 px-2.5 py-1 rounded border border-amber-500/20">
                  🔒 Correct answers hidden for active/scheduled test
                </span>
              )}
            </div>

            <div className="space-y-4">
              {questions.map((q, idx) => (
                <div key={q.id || `q_insp_${idx}`} className="p-4 rounded-xl bg-surface/80 border border-border space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <h4 className="text-sm font-bold text-foreground">
                      Q{idx + 1}. {q.questionText || (q as any).question || 'Question unavailable'}
                    </h4>
                    <span className="text-[10px] bg-surface-hover text-muted-foreground px-2 py-0.5 rounded font-mono shrink-0">
                      {q.type || 'MCQ_SINGLE'}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {q.options?.map((opt, oIdx) => {
                      const optText = opt.optionText || (opt as any).text || (typeof opt === 'string' ? opt : `Option ${oIdx + 1}`);
                      const isCorrect = opt.isCorrect || q.correctOptionId === opt.id;
                      return (
                        <div
                          key={opt.id || `opt_insp_${oIdx}`}
                          className={`p-2.5 rounded-lg text-xs border ${
                            isCorrect
                              ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-300 font-semibold'
                              : 'bg-background border-border/80 text-foreground'
                          }`}
                        >
                          <span>{optText}</span>
                          {isCorrect && <span className="ml-2 text-emerald-400 font-bold">✓</span>}
                        </div>
                      );
                    })}
                  </div>

                  {q.explanation && (
                    <div className="p-2.5 rounded-lg bg-indigo-950/30 border border-indigo-500/20 text-xs text-indigo-200">
                      <span className="font-bold text-indigo-400">Explanation: </span>
                      {q.explanation}
                    </div>
                  )}

                  {q.groundingSource && (
                    <div className="text-[11px] text-muted-foreground font-mono">
                      <span>Source Evidence: </span>
                      <span className="text-muted-foreground">{q.groundingSource}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
