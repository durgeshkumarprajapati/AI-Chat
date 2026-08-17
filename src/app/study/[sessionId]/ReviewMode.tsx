'use client';

import { useState, useEffect } from 'react';
import { ReviewPriorityTopic } from '@/features/study/modes/review.service';

export function ReviewMode({
  sessionId,
  onSelectReviewTopic
}: {
  sessionId: string;
  onSelectReviewTopic: (_topicId: string) => void;
}) {
  const [topics, setTopics] = useState<ReviewPriorityTopic[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadReviewTopics() {
      try {
        const res = await fetch(`/api/study/sessions/${sessionId}/review`);
        const data = await res.json();
        if (data.success && Array.isArray(data.data)) {
          setTopics(data.data);
        }
      } catch (err) {
        console.error('Failed to load review topics', err);
      } finally {
        setLoading(false);
      }
    }

    loadReviewTopics();
  }, [sessionId]);

  if (loading) {
    return <div className="p-8 text-center text-xs text-slate-400 font-mono">Calculating adaptive review priorities...</div>;
  }

  return (
    <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-6 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <span className="text-xl">🔄</span>
          <h2 className="text-base font-bold text-slate-900 dark:text-white">Adaptive Spaced Review</h2>
        </div>
        <span className="text-xs text-slate-400 font-mono">Sorted by Review Priority</span>
      </div>

      <div className="space-y-3">
        {topics.map((t) => (
          <div
            key={t.topicId}
            className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4"
          >
            <div className="space-y-1.5 flex-1">
              <div className="flex items-center space-x-2">
                <span
                  className={`text-[10px] font-bold font-mono px-2 py-0.5 rounded ${
                    t.priority === 'HIGH'
                      ? 'bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-300'
                      : t.priority === 'MEDIUM'
                      ? 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300'
                      : 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300'
                  }`}
                >
                  {t.priority} PRIORITY
                </span>
                <h3 className="text-xs font-bold text-slate-900 dark:text-white">{t.topicTitle}</h3>
              </div>

              <p className="text-[11px] text-slate-600 dark:text-slate-400">{t.reason}</p>

              {/* Progress Bar */}
              <div className="w-full bg-slate-200 dark:bg-slate-800 rounded-full h-1.5 overflow-hidden">
                <div
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    t.masteryScore < 40 ? 'bg-rose-500' : t.masteryScore <= 70 ? 'bg-amber-500' : 'bg-emerald-500'
                  }`}
                  style={{ width: `${Math.max(5, t.masteryScore)}%` }}
                />
              </div>
            </div>

            <button
              onClick={() => onSelectReviewTopic(t.topicId)}
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold whitespace-nowrap transition shadow"
            >
              Start Topic Review ➔
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
