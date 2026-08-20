'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';

interface MCQQuestion {
  id: string;
  question: string;
  options: [string, string, string, string];
  correctOptionIndex: number;
  explanation: string;
}

export default function TestTakerPage({ params }: { params: { id: string } }) {
  const [loading, setLoading] = useState(true);
  const [details, setDetails] = useState<any>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [testSession, setTestSession] = useState<any>(null);
  const [currentQIndex, setCurrentQIndex] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<number, number>>({});

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionResult, setSubmissionResult] = useState<any>(null);

  const [remainingSec, setRemainingSec] = useState<number | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const fetchDetails = async () => {
    try {
      const res = await fetch(`/api/study/mock-tests/${params.id}`);
      const data = await res.json();
      if (data.success && data.data) {
        setDetails(data.data);
      } else {
        setErrorMsg(data.error || 'Failed to fetch test details');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Error loading test details');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDetails();
  }, [params.id]);

  const handleStartSession = async () => {
    try {
      const res = await fetch(`/api/study/mock-tests/${params.id}/start`, { method: 'POST' });
      const data = await res.json();
      if (data.success && data.data) {
        setTestSession(data.data);
        const expMs = data.data.expirationTimeMs;
        const nowMs = Date.now();
        const rem = Math.max(0, Math.floor((expMs - nowMs) / 1000));
        setRemainingSec(rem);

        if (timerRef.current) clearInterval(timerRef.current);
        timerRef.current = setInterval(() => {
          setRemainingSec((prev) => {
            if (prev === null || prev <= 1) {
              if (timerRef.current) clearInterval(timerRef.current);
              return 0;
            }
            return prev - 1;
          });
        }, 1000);
      } else {
        setErrorMsg(data.error || 'Failed to start test session');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Error starting session');
    }
  };

  const handleSubmitTest = async () => {
    if (!testSession || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const answersArray = (testSession.questions as MCQQuestion[]).map((_, idx) => ({
        questionIndex: idx,
        selectedOptionIndex: selectedAnswers[idx] !== undefined ? selectedAnswers[idx] : -1
      }));

      const res = await fetch(`/api/study/mock-tests/${params.id}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers: answersArray })
      });
      const data = await res.json();
      if (data.success && data.data) {
        setSubmissionResult(data.data);
        if (timerRef.current) clearInterval(timerRef.current);
      } else {
        setErrorMsg(data.error || 'Submission failed');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Error submitting answers');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="w-full min-h-screen flex items-center justify-center text-xs text-slate-400 animate-pulse">
        Loading AI Mock Test details...
      </div>
    );
  }

  if (errorMsg || !details) {
    return (
      <div className="w-full max-w-xl mx-auto p-8 text-center space-y-4">
        <div className="p-4 bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs rounded-2xl">
          {errorMsg || 'Mock Test not found'}
        </div>
        <Link href="/study/mock-tests" className="inline-block px-4 py-2 bg-slate-800 text-white text-xs rounded-xl">
          ← Back to Mock Tests
        </Link>
      </div>
    );
  }

  const { mockTest, isExpired } = details;
  const questions = (testSession?.questions || mockTest.questions) as MCQQuestion[];
  const currentQ = questions[currentQIndex];

  return (
    <div className="w-full max-w-4xl mx-auto p-4 sm:p-8 space-y-6 text-slate-900 dark:text-white">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="text-xs px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-400 font-mono font-bold uppercase">
              {mockTest.status}
            </span>
            <h1 className="text-xl font-bold">{mockTest.title}</h1>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {mockTest.topic || 'General Practice'} • {mockTest.durationMinutes} Minutes • {questions.length} Questions
          </p>
        </div>

        <Link
          href="/collab-chat"
          className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold rounded-xl shadow transition"
        >
          💬 Collab Chat
        </Link>
      </div>

      {/* Submission Results State */}
      {submissionResult ? (
        <div className="p-6 bg-slate-900 border border-slate-800 rounded-2xl space-y-6 text-white shadow-xl">
          <div className="text-center space-y-2">
            <span className="text-4xl">{submissionResult.passed ? '🎉' : '📊'}</span>
            <h2 className="text-xl font-bold">
              {submissionResult.passed ? 'PASSED SUCCESSFUL!' : 'TEST COMPLETED'}
            </h2>
            <div className="inline-block px-4 py-1.5 rounded-full bg-gradient-to-r from-indigo-600 to-purple-600 font-mono font-bold text-base shadow">
              Score: {submissionResult.score}% ({submissionResult.correctCount} / {submissionResult.totalQuestions} Correct)
            </div>
          </div>

          <div className="space-y-4 pt-4 border-t border-slate-800">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Detailed Question Breakdown</h3>
            {questions.map((q, idx) => {
              const userAns = submissionResult.evaluatedAnswers.find((a: any) => a.questionIndex === idx);
              const isCorrect = userAns?.isCorrect;
              return (
                <div
                  key={q.id || idx}
                  className={`p-4 rounded-xl border text-xs space-y-2 ${
                    isCorrect ? 'bg-emerald-950/30 border-emerald-500/40' : 'bg-rose-950/30 border-rose-500/40'
                  }`}
                >
                  <div className="flex justify-between items-start font-semibold">
                    <span>Q{idx + 1}. {q.question}</span>
                    <span className={`px-2 py-0.5 rounded font-mono font-bold text-[10px] ${isCorrect ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'}`}>
                      {isCorrect ? '✓ Correct' : '✕ Incorrect'}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] font-mono">
                    {q.options.map((opt, oIdx) => (
                      <div
                        key={oIdx}
                        className={`p-2 rounded-lg border ${
                          oIdx === q.correctOptionIndex
                            ? 'bg-emerald-600 text-white font-bold border-emerald-400'
                            : userAns?.selectedOptionIndex === oIdx
                            ? 'bg-rose-600 text-white font-bold border-rose-400'
                            : 'bg-slate-950 text-slate-400 border-slate-800'
                        }`}
                      >
                        {String.fromCharCode(65 + oIdx)}. {opt}
                      </div>
                    ))}
                  </div>
                  <p className="text-[11px] text-slate-300 italic pt-1">💡 {q.explanation}</p>
                </div>
              );
            })}
          </div>
        </div>
      ) : !testSession ? (
        /* Lobby State before starting quiz */
        <div className="p-8 bg-slate-900 border border-slate-800 rounded-2xl text-center space-y-4 text-white shadow-lg">
          <div className="text-3xl">⏱</div>
          <h2 className="text-lg font-bold">Ready to Start Test?</h2>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            Once you click Start Test, your server-authoritative timer of {mockTest.durationMinutes} minutes will begin!
          </p>

          <div className="flex justify-center space-x-3 pt-2">
            {mockTest.googleCalendarLink && (
              <a
                href={mockTest.googleCalendarLink}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl"
              >
                📅 Google Calendar
              </a>
            )}

            <button
              onClick={handleStartSession}
              disabled={isExpired}
              className="px-6 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs rounded-xl shadow-lg transition"
            >
              {isExpired ? 'Mock Test Expired' : '🚀 Start Test Session Now'}
            </button>
          </div>
        </div>
      ) : (
        /* Active Test Session State */
        <div className="space-y-6">
          {/* Top Timer Bar */}
          <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl flex items-center justify-between text-xs text-white font-mono shadow">
            <span>Question {currentQIndex + 1} of {questions.length}</span>
            {remainingSec !== null && (
              <span className={`font-bold px-3 py-1 rounded-lg ${remainingSec < 300 ? 'bg-rose-600 text-white animate-pulse' : 'bg-indigo-900 text-indigo-200'}`}>
                ⏳ Time Left: {Math.floor(remainingSec / 60)}:{Math.floor(remainingSec % 60).toString().padStart(2, '0')}
              </span>
            )}
          </div>

          {/* Current MCQ Card */}
          {currentQ && (
            <div className="p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl space-y-4 shadow-sm">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white leading-relaxed">
                Q{currentQIndex + 1}. {currentQ.question}
              </h3>

              <div className="space-y-2">
                {currentQ.options.map((opt, oIdx) => {
                  const isSelected = selectedAnswers[currentQIndex] === oIdx;
                  return (
                    <div
                      key={oIdx}
                      onClick={() => setSelectedAnswers((prev) => ({ ...prev, [currentQIndex]: oIdx }))}
                      className={`p-3 rounded-xl border transition cursor-pointer text-xs flex items-center space-x-3 ${
                        isSelected
                          ? 'bg-indigo-600 text-white border-indigo-500 font-semibold shadow-sm'
                          : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 hover:border-indigo-500/40 text-slate-800 dark:text-slate-200'
                      }`}
                    >
                      <span className={`w-6 h-6 rounded-lg font-mono font-bold text-[11px] flex items-center justify-center ${isSelected ? 'bg-white text-indigo-600' : 'bg-slate-200 dark:bg-slate-800'}`}>
                        {String.fromCharCode(65 + oIdx)}
                      </span>
                      <span>{opt}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Pagination & Submit Bar */}
          <div className="flex items-center justify-between">
            <button
              onClick={() => setCurrentQIndex((prev) => Math.max(0, prev - 1))}
              disabled={currentQIndex === 0}
              className="px-4 py-2 bg-slate-800 disabled:opacity-40 text-white text-xs font-semibold rounded-xl"
            >
              ← Previous
            </button>

            {currentQIndex < questions.length - 1 ? (
              <button
                onClick={() => setCurrentQIndex((prev) => Math.min(questions.length - 1, prev + 1))}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl shadow"
              >
                Next Question →
              </button>
            ) : (
              <button
                onClick={handleSubmitTest}
                disabled={isSubmitting}
                className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-lg transition"
              >
                {isSubmitting ? 'Submitting...' : 'Submit Answers 🚀'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
