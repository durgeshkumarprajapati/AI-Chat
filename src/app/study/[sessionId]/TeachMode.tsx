'use client';

import { useState, useEffect } from 'react';
import { ttsService } from '@/features/tts/tts.service';
import { TeachLessonPayload } from '@/features/study/modes/teach.service';

export function TeachMode({ sessionId }: { sessionId: string }) {
  const [lesson, setLesson] = useState<TeachLessonPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isSpeaking, setIsSpeaking] = useState(false);
  const [checkAnswer, setCheckAnswer] = useState('');
  const [checkSubmitted, setCheckSubmitted] = useState(false);

  useEffect(() => {
    async function fetchLesson() {
      try {
        const res = await fetch(`/api/study/sessions/${sessionId}/teach`, {
          method: 'POST'
        });
        const data = await res.json();
        if (data.success && !data.data.error) {
          setLesson(data.data);
        } else {
          setError(data.data?.error || data.error || 'Failed to generate lesson.');
        }
      } catch (err: any) {
        setError(err.message || 'Failed to load lesson.');
      } finally {
        setLoading(false);
      }
    }

    fetchLesson();
  }, [sessionId]);

  const handleSpeakText = (text: string) => {
    if (isSpeaking) {
      ttsService.stop();
      setIsSpeaking(false);
    } else {
      ttsService.speak(text, {
        onStart: () => setIsSpeaking(true),
        onEnd: () => setIsSpeaking(false),
        onError: () => setIsSpeaking(false)
      });
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-xs text-slate-400 font-mono">Generating grounded lesson from authorized documents...</div>;
  }

  if (error) {
    return <div className="p-8 text-center text-xs text-rose-400 font-mono">{error}</div>;
  }

  if (!lesson) return null;

  return (
    <div className="space-y-6">
      {/* Lesson Container */}
      <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-5 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="text-xl">📖</span>
            <h2 className="text-base font-bold text-slate-900 dark:text-white">Grounded Tutor Lesson: {lesson.topicTitle}</h2>
          </div>

          <button
            onClick={() => handleSpeakText(lesson.explanation)}
            className={`px-3 py-1.5 rounded-xl border text-xs transition flex items-center space-x-1.5 ${
              isSpeaking
                ? 'bg-indigo-950 border-indigo-700 text-indigo-300 animate-pulse'
                : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <span>{isSpeaking ? '🔊 Playing...' : '🔈 Listen'}</span>
          </button>
        </div>

        {/* Explanation */}
        <div className="text-xs text-slate-800 dark:text-slate-200 leading-relaxed font-sans whitespace-pre-wrap p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
          {lesson.explanation}
        </div>

        {/* Key Concepts & Common Mistakes Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2">
            <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 block">✨ Key Concepts</span>
            <ul className="space-y-1.5 text-xs text-slate-700 dark:text-slate-300 list-disc list-inside">
              {lesson.keyConcepts.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2">
            <span className="text-xs font-bold text-amber-600 dark:text-amber-400 block">⚠️ Common Pitfalls</span>
            <ul className="space-y-1.5 text-xs text-slate-700 dark:text-slate-300 list-disc list-inside">
              {lesson.commonMistakes.map((m, i) => (
                <li key={i}>{m}</li>
              ))}
            </ul>
          </div>
        </div>

        {/* Example */}
        {lesson.example && (
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2">
            <span className="text-xs font-bold text-slate-900 dark:text-white block">💡 Grounded Example</span>
            <p className="text-xs text-slate-700 dark:text-slate-300 font-mono leading-relaxed">{lesson.example}</p>
          </div>
        )}

        {/* Understanding Check */}
        {lesson.understandingCheck && (
          <div className="p-4 rounded-xl bg-indigo-50/50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 space-y-3">
            <span className="text-xs font-bold text-indigo-900 dark:text-indigo-200 block">❓ Quick Comprehension Check</span>
            <p className="text-xs font-medium text-slate-800 dark:text-slate-200">{lesson.understandingCheck.question}</p>

            {lesson.understandingCheck.options ? (
              <div className="grid grid-cols-1 gap-2">
                {lesson.understandingCheck.options.map((opt, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      setCheckAnswer(opt);
                      setCheckSubmitted(true);
                    }}
                    className={`p-3 rounded-xl text-xs text-left border transition ${
                      checkAnswer === opt
                        ? 'bg-indigo-600 text-white font-bold border-indigo-500'
                        : 'bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 border-slate-200 dark:border-slate-800 hover:border-indigo-400'
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            ) : (
              <div className="flex space-x-2">
                <input
                  type="text"
                  value={checkAnswer}
                  onChange={(e) => setCheckAnswer(e.target.value)}
                  placeholder="Your answer..."
                  className="flex-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-2.5 text-xs text-slate-900 dark:text-white"
                />
                <button
                  onClick={() => setCheckSubmitted(true)}
                  className="px-4 py-2 bg-indigo-600 text-white text-xs font-semibold rounded-xl"
                >
                  Check
                </button>
              </div>
            )}

            {checkSubmitted && (
              <div className="p-3 rounded-xl bg-emerald-100 dark:bg-emerald-950 text-emerald-900 dark:text-emerald-200 text-xs font-medium">
                Expected Answer: {lesson.understandingCheck.expectedAnswer}
              </div>
            )}
          </div>
        )}

        {/* Citations */}
        {lesson.citations.length > 0 && (
          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-500 font-mono flex items-center space-x-2">
            <span>Citations:</span>
            {lesson.citations.map((c, i) => (
              <span key={i} className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                {c.title} (Pg {c.pageNumber || 1})
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
