'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function StudyWorkspacePage() {
  const router = useRouter();
  const [sessions, setSessions] = useState<any[]>([]);
  const [weakAreas, setWeakAreas] = useState<any[]>([]);
  const [recommendation, setRecommendation] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const [sessRes, weakRes, recRes] = await Promise.all([
          fetch('/api/study/sessions'),
          fetch('/api/study/weak-areas'),
          fetch('/api/study/recommendations')
        ]);

        const sessData = await sessRes.json();
        const weakData = await weakRes.json();
        const recData = await recRes.json();

        if (sessData.success) setSessions(sessData.data || []);
        if (weakData.success) setWeakAreas(weakData.data || []);
        if (recData.success) setRecommendation(recData.data || null);
      } catch (err) {
        console.error('Failed to load study data', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-6">
        <div>
          <div className="flex items-center space-x-2">
            <span className="text-2xl">📚</span>
            <h1 className="text-2xl font-bold text-white tracking-tight">AI Study & Tutor Workspace</h1>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Grounded personalized tutoring, Socratic questioning, quizzes, and adaptive learning.
          </p>
        </div>

        <Link
          href="/study/new"
          className="inline-flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-lg shadow-indigo-600/20 transition-all self-start sm:self-auto"
        >
          <span>✨ Create Study Session</span>
        </Link>
      </div>

      {/* Recommendation Card */}
      {recommendation && (
        <div className="p-5 rounded-2xl bg-gradient-to-r from-indigo-950/60 via-slate-900 to-purple-950/60 border border-indigo-500/20 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center space-x-2 text-indigo-400 font-semibold text-xs uppercase tracking-wider">
              <span>🎯 Recommended Review</span>
            </div>
            <h3 className="text-base font-semibold text-white">{recommendation.recommendedTopic}</h3>
            <p className="text-xs text-slate-300">{recommendation.reason}</p>
          </div>
          {recommendation.recommendedSessionId && (
            <button
              onClick={() => router.push(`/study/${recommendation.recommendedSessionId}`)}
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow transition whitespace-nowrap"
            >
              Continue Review ➔
            </button>
          )}
        </div>
      )}

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left 2 Cols: My Study Sessions */}
        <div className="lg:col-span-2 space-y-4">
          <h2 className="text-lg font-bold text-white flex items-center space-x-2">
            <span>📖</span>
            <span>My Study Sessions</span>
          </h2>

          {loading ? (
            <div className="p-8 text-center text-xs text-slate-400 bg-slate-900/50 rounded-2xl border border-slate-800">
              Loading study sessions...
            </div>
          ) : sessions.length === 0 ? (
            <div className="p-8 text-center space-y-3 bg-slate-900/50 rounded-2xl border border-slate-800">
              <p className="text-xs text-slate-400">No active study sessions found.</p>
              <Link
                href="/study/new"
                className="inline-block px-4 py-2 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 text-xs font-semibold transition border border-indigo-500/30"
              >
                Start your first Study Session
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {sessions.map((sess) => (
                <div
                  key={sess.id}
                  onClick={() => router.push(`/study/${sess.id}`)}
                  className="p-5 rounded-2xl bg-slate-900 border border-slate-800 hover:border-indigo-500/40 transition cursor-pointer space-y-3 group"
                >
                  <div className="flex items-start justify-between">
                    <span className="text-xs font-semibold px-2.5 py-1 rounded-md bg-indigo-950 text-indigo-300 border border-indigo-800/40">
                      {sess.difficulty}
                    </span>
                    <span className="text-[11px] text-slate-400 font-mono">
                      {sess.progressPercent}% Mastered
                    </span>
                  </div>

                  <div>
                    <h3 className="text-sm font-bold text-white group-hover:text-indigo-400 transition">
                      {sess.title}
                    </h3>
                    <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">
                      Goal: {sess.goal?.replace('_', ' ')} • {sess.topics?.length || 0} topics
                    </p>
                  </div>

                  {/* Progress Bar */}
                  <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-indigo-500 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${sess.progressPercent}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right Col: Weak Areas */}
        <div className="space-y-4">
          <h2 className="text-lg font-bold text-white flex items-center space-x-2">
            <span>⚡</span>
            <span>Weak Areas to Focus</span>
          </h2>

          <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
            {weakAreas.length === 0 ? (
              <p className="text-xs text-slate-400">No weak areas identified yet! Keep practicing to track topic mastery scores.</p>
            ) : (
              weakAreas.map((wa, idx) => (
                <div
                  key={idx}
                  onClick={() => router.push(`/study/${wa.sessionId}`)}
                  className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 hover:border-amber-500/30 transition cursor-pointer flex items-center justify-between"
                >
                  <div>
                    <h4 className="text-xs font-bold text-white">{wa.topicTitle}</h4>
                    <p className="text-[10px] text-slate-400">{wa.sessionTitle}</p>
                  </div>
                  <span className="text-xs font-bold text-amber-400 font-mono">
                    {wa.masteryScore}%
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
