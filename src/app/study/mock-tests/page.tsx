'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';

export default function MockTestsDashboardPage() {
  const [topic, setTopic] = useState('');
  const [title, setTitle] = useState('');
  const [scheduledStartTime, setScheduledStartTime] = useState('');
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [totalQuestions, setTotalQuestions] = useState(10);

  const [isScheduling, setIsScheduling] = useState(false);
  const [scheduledTest, setScheduledTest] = useState<any>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    // Set default scheduled time to 15 minutes from now in local ISO format
    const defaultTime = new Date(Date.now() + 15 * 60 * 1000);
    const tzOffset = defaultTime.getTimezoneOffset() * 60000;
    const localIso = new Date(defaultTime.getTime() - tzOffset).toISOString().slice(0, 16);
    setScheduledStartTime(localIso);
  }, []);

  const handleScheduleTest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !scheduledStartTime) return;

    setIsScheduling(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/study/mock-tests/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          topic: topic.trim() || title.trim(),
          scheduledStartTime: new Date(scheduledStartTime).toISOString(),
          durationMinutes,
          totalQuestions
        })
      });
      const data = await res.json();
      if (data.success && data.data) {
        setScheduledTest(data.data);
      } else {
        setErrorMsg(data.error || 'Failed to schedule test');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Error scheduling test');
    } finally {
      setIsScheduling(false);
    }
  };

  return (
    <div className="w-full max-w-5xl mx-auto p-6 sm:p-8 space-y-6 text-slate-900 dark:text-white">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center space-x-2">
            <span>📝</span>
            <span>AI Mock Test Center & Calendar Sync</span>
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Generate 4-option MCQ mock tests using Gemini, schedule live tests, sync Google Calendar & share with study groups!
          </p>
        </div>

        <Link
          href="/collab-chat"
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs rounded-xl shadow transition"
        >
          💬 Back to Collaboration Chat
        </Link>
      </div>

      {/* Creation & Scheduling Form */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-4">
        <h2 className="text-sm font-bold uppercase tracking-wider text-indigo-500">Schedule New AI Mock Test</h2>

        {errorMsg && (
          <div className="p-3 bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs rounded-xl">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleScheduleTest} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2 space-y-1">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Test Title *</label>
            <input
              type="text"
              required
              placeholder="e.g. System Architecture & Kubernetes Mastery Test"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 text-xs focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Topic / Subject</label>
            <input
              type="text"
              placeholder="e.g. Distributed Databases & Consensus"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 text-xs focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Scheduled Start Time *</label>
            <input
              type="datetime-local"
              required
              value={scheduledStartTime}
              onChange={(e) => setScheduledStartTime(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 text-xs focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Duration (Minutes)</label>
            <input
              type="number"
              min={5}
              max={180}
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(parseInt(e.target.value, 10) || 30)}
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 text-xs focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Number of MCQs</label>
            <input
              type="number"
              min={3}
              max={50}
              value={totalQuestions}
              onChange={(e) => setTotalQuestions(parseInt(e.target.value, 10) || 10)}
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 text-xs focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="sm:col-span-2 pt-2 flex justify-end">
            <button
              type="submit"
              disabled={isScheduling}
              className="px-6 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-lg transition flex items-center space-x-2"
            >
              <span>{isScheduling ? 'Generating & Scheduling...' : '✨ Generate & Schedule Test'}</span>
            </button>
          </div>
        </form>
      </div>

      {/* Confirmation & Calendar Sync Panel */}
      {scheduledTest && (
        <div className="p-6 bg-gradient-to-br from-indigo-900/80 to-purple-900/80 border border-indigo-500/40 rounded-2xl text-white space-y-4 shadow-xl">
          <div className="flex items-center space-x-2">
            <span className="text-2xl">🎉</span>
            <div>
              <h3 className="text-base font-bold">AI Mock Test Successfully Scheduled!</h3>
              <p className="text-xs text-indigo-200 mt-0.5">ID: {scheduledTest.id}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs bg-slate-950/60 p-4 rounded-xl border border-indigo-500/20 font-mono">
            <div>
              <span className="text-slate-400 block">Title:</span>
              <span className="font-bold text-white">{scheduledTest.title}</span>
            </div>
            <div>
              <span className="text-slate-400 block">Start Time:</span>
              <span className="font-bold text-emerald-400">{new Date(scheduledTest.scheduledStartTime).toLocaleString()}</span>
            </div>
            <div>
              <span className="text-slate-400 block">Duration & MCQs:</span>
              <span className="font-bold text-purple-300">{scheduledTest.durationMinutes} mins • {scheduledTest.totalQuestions} Questions</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            {scheduledTest.googleCalendarLink && (
              <a
                href={scheduledTest.googleCalendarLink}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs rounded-xl shadow transition flex items-center space-x-1.5"
              >
                <span>📅</span>
                <span>Add to Google Calendar</span>
              </a>
            )}

            <a
              href={`/api/study/mock-tests/${scheduledTest.id}/ics`}
              download
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs rounded-xl shadow transition flex items-center space-x-1.5"
            >
              <span>📥</span>
              <span>Download .ics File</span>
            </a>

            <Link
              href={`/study/mock-tests/${scheduledTest.id}`}
              className="px-5 py-2 bg-indigo-500 hover:bg-indigo-400 text-white font-bold text-xs rounded-xl shadow transition flex items-center space-x-1.5"
            >
              <span>🚀</span>
              <span>Open Test Lobby</span>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
