'use client';

import { useState, useEffect } from 'react';
import { PracticeExerciseItem } from '@/features/study/modes/practice.service';

export function PracticeMode({ sessionId, topicId }: { sessionId: string; topicId?: string }) {
  const [exercise, setExercise] = useState<PracticeExerciseItem | null>(null);
  const [userSolution, setUserSolution] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [evalResult, setEvalResult] = useState<any>(null);

  useEffect(() => {
    async function loadExercise() {
      if (!topicId) return;
      try {
        const res = await fetch(`/api/study/sessions/${sessionId}/practice`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ topicId })
        });
        const data = await res.json();
        if (data.success) {
          setExercise(data.data);
          if (data.data.starterCode) {
            setUserSolution(data.data.starterCode);
          }
        }
      } catch (err) {
        console.error('Failed to load practice exercise', err);
      } finally {
        setLoading(false);
      }
    }

    loadExercise();
  }, [sessionId, topicId]);

  const handleSubmitSolution = async () => {
    if (!exercise || !userSolution.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/study/sessions/${sessionId}/practice/evaluate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          exerciseId: exercise.id,
          solution: userSolution
        })
      });

      const data = await res.json();
      if (data.success) {
        setEvalResult(data.data);
      }
    } catch (err) {
      console.error('Failed to evaluate solution', err);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-xs text-slate-400 font-mono">Generating practical exercise...</div>;
  }

  if (!exercise) return null;

  return (
    <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-6 shadow-sm">
      <div className="flex items-center space-x-2">
        <span className="text-xl">🛠️</span>
        <h2 className="text-base font-bold text-slate-900 dark:text-white">Practical Exercise: {exercise.title}</h2>
      </div>

      <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-3">
        <p className="text-xs font-medium text-slate-800 dark:text-slate-200 leading-relaxed">{exercise.prompt}</p>

        {exercise.requirements.length > 0 && (
          <div className="space-y-1">
            <span className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400">Requirements:</span>
            <ul className="list-disc list-inside text-xs text-slate-600 dark:text-slate-400 space-y-1">
              {exercise.requirements.map((req, i) => (
                <li key={i}>{req}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Editor / Solution Input */}
      <div className="space-y-2">
        <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Your Practical Solution / Code:</label>
        <textarea
          value={userSolution}
          onChange={(e) => setUserSolution(e.target.value)}
          rows={7}
          placeholder="Write your implementation or decision solution here..."
          className="w-full font-mono bg-slate-950 text-slate-100 border border-slate-800 rounded-xl p-3 text-xs focus:outline-none focus:border-indigo-500 resize-none"
        />
      </div>

      <div className="flex justify-end">
        <button
          onClick={handleSubmitSolution}
          disabled={submitting || !userSolution.trim()}
          className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow transition disabled:opacity-50"
        >
          {submitting ? 'Evaluating AI Rubric...' : 'Submit Practical Solution ✨'}
        </button>
      </div>

      {/* Evaluation Toast */}
      {evalResult && (
        <div
          className={`p-5 rounded-2xl border space-y-3 ${
            evalResult.passed
              ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-800/60 text-emerald-900 dark:text-emerald-200'
              : 'bg-amber-50 dark:bg-amber-950/60 border-amber-200 dark:border-amber-800/60 text-amber-900 dark:text-amber-200'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="font-bold text-sm">
              {evalResult.passed ? '✅ Solution Passed!' : '⚠️ Review Needed'}
            </span>
            <span className="font-mono text-xs font-bold px-2.5 py-1 rounded bg-black/10 dark:bg-black/40">
              Score: {evalResult.score} / 10
            </span>
          </div>

          <p className="text-xs leading-relaxed">{evalResult.feedback}</p>
        </div>
      )}
    </div>
  );
}
