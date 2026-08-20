'use client';

import React, { useState, useEffect, use } from 'react';
import Link from 'next/link';

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

export default function MockTestDetailPage({ params }: { params: { id: string } | Promise<{ id: string }> }) {
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

  const handleStartSession = async () => {
    try {
      const res = await fetch(`/api/study/mock-tests/${testId}/start`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setIsTakingTest(true);
      } else {
        alert(data.error || 'Failed to start quiz session');
      }
    } catch {
      alert('Failed to connect server');
    }
  };

  const handleOptionSelect = (questionId: string, optionId: string) => {
    setSelectedAnswers((prev) => ({
      ...prev,
      [questionId]: [optionId]
    }));
  };

  const handleSubmitTest = async () => {
    setSubmitting(true);
    try {
      const submissions = Object.entries(selectedAnswers).map(([questionId, selectedOptionIds]) => ({
        questionId,
        selectedOptionIds
      }));

      const res = await fetch(`/api/study/mock-tests/${testId}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ submissions })
      });

      const data = await res.json();
      if (data.success) {
        setScoreResult(data.scoreResult);
        setIsTakingTest(false);
        fetchTestDetails();
        fetchTestQuestions();
      } else {
        alert(data.error || 'Failed to submit test');
      }
    } catch {
      alert('Submission failed');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading && !test) {
    return <div className="min-h-screen bg-slate-950 text-slate-400 p-10 text-center text-sm">Loading test details...</div>;
  }

  if (!test) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 p-10 text-center space-y-4">
        <h2 className="text-xl font-bold">Mock Test Not Found</h2>
        <Link href="/study/mock-tests" className="inline-block px-4 py-2 bg-slate-800 text-xs text-slate-200 rounded-lg">
          Back to Library
        </Link>
      </div>
    );
  }

  const isCompleted = test.status === 'COMPLETED' || Boolean(userParticipant?.submittedAt) || Boolean(scoreResult);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 md:p-10">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs px-2.5 py-0.5 rounded-full font-bold uppercase bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                {test.status}
              </span>
              <span className="text-xs text-slate-400">Created by {test.createdBy?.name || 'Instructor'}</span>
            </div>
            <h1 className="text-2xl font-bold text-white">{test.title}</h1>
            <p className="text-xs text-slate-400 mt-1">{test.topic || test.description || 'AI MCQ Assessment'}</p>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/study/mock-tests"
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl transition"
            >
              ← Back to Library
            </Link>
            {!isTakingTest && !isCompleted && (
              <button
                onClick={handleStartSession}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow-md transition"
              >
                🚀 Take Test Now
              </button>
            )}
          </div>
        </div>

        {/* Score Summary Banner if completed */}
        {(isCompleted || scoreResult) && (
          <div className="p-5 bg-gradient-to-r from-emerald-950/60 to-slate-900 border border-emerald-500/30 rounded-2xl flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-emerald-400">Quiz Submitted & Evaluated</h3>
              <p className="text-xs text-slate-300 mt-0.5">
                Score: <span className="font-bold text-white">{scoreResult?.scorePercentage || userParticipant?.score || 100}%</span> •{' '}
                {scoreResult?.passed || userParticipant?.passed ? 'PASSED ✅' : 'NEEDS IMPROVEMENT ⚠'}
              </p>
            </div>
            <div className="text-2xl">🏆</div>
          </div>
        )}

        {/* Active Quiz Taking Session */}
        {isTakingTest ? (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white">Active Test Session</h3>
              <span className="text-xs text-amber-400 font-mono font-semibold">⏱ Time Remaining: Server Authoritative</span>
            </div>

            <div className="space-y-6">
              {questions.map((q, idx) => (
                <div key={q.id} className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                  <h4 className="text-sm font-bold text-slate-100">
                    Q{idx + 1}. {q.questionText}
                  </h4>
                  <div className="space-y-2">
                    {q.options.map((opt) => {
                      const isSelected = selectedAnswers[q.id]?.includes(opt.id);
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => handleOptionSelect(q.id, opt.id)}
                          className={`w-full text-left p-3 rounded-lg text-xs transition border ${
                            isSelected
                              ? 'bg-emerald-600/20 border-emerald-500 text-emerald-300 font-semibold'
                              : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
                          }`}
                        >
                          {opt.optionText}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-4 border-t border-slate-800 flex justify-end">
              <button
                onClick={handleSubmitTest}
                disabled={submitting}
                className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl transition"
              >
                {submitting ? 'Submitting...' : 'Submit Answers Now'}
              </button>
            </div>
          </div>
        ) : (
          /* Question Bank Inspector View */
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-200">Question Bank Inspector ({questions.length} MCQs)</h3>
              {isSanitized && (
                <span className="text-[11px] text-amber-400 font-mono bg-amber-500/10 px-2.5 py-1 rounded border border-amber-500/20">
                  🔒 Correct answers hidden for active/scheduled test
                </span>
              )}
            </div>

            <div className="space-y-4">
              {questions.map((q, idx) => (
                <div key={q.id} className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <h4 className="text-sm font-bold text-slate-100">
                      Q{idx + 1}. {q.questionText}
                    </h4>
                    <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded font-mono shrink-0">
                      {q.type || 'MCQ_SINGLE'}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {q.options.map((opt) => {
                      const isCorrect = opt.isCorrect || q.correctOptionId === opt.id;
                      return (
                        <div
                          key={opt.id}
                          className={`p-2.5 rounded-lg text-xs border ${
                            isCorrect
                              ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-300 font-semibold'
                              : 'bg-slate-950 border-slate-800/80 text-slate-300'
                          }`}
                        >
                          <span>{opt.optionText}</span>
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
                    <div className="text-[11px] text-slate-500 font-mono">
                      <span>Source Evidence: </span>
                      <span className="text-slate-400">{q.groundingSource}</span>
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
