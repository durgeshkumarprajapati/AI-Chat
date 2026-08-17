'use client';

import { useState } from 'react';
import { ttsService } from '@/features/tts/tts.service';

export function QuizMode({
  sessionId,
  activeQuestion,
  onNextQuestion,
  isGeneratingNextQuestion = false
}: {
  sessionId: string;
  activeQuestion: any;
  onNextQuestion: () => void;
  isGeneratingNextQuestion?: boolean;
}) {
  const [userAnswer, setUserAnswer] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [evalResult, setEvalResult] = useState<any>(null);

  const [hintCount, setHintCount] = useState(0);
  const [currentHint, setCurrentHint] = useState<string | null>(null);
  const [fetchingHint, setFetchingHint] = useState(false);

  const [isSpeaking, setIsSpeaking] = useState(false);

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

  const handleFetchHint = async () => {
    if (!activeQuestion) return;
    setFetchingHint(true);
    try {
      const nextHintNum = hintCount + 1;
      const res = await fetch(`/api/study/sessions/${sessionId}/hint`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          questionId: activeQuestion.id,
          hintNumber: nextHintNum
        })
      });
      const data = await res.json();
      if (data.success) {
        setHintCount(nextHintNum);
        setCurrentHint(data.data.hint);
      }
    } catch (err) {
      console.error('Failed to fetch hint', err);
    } finally {
      setFetchingHint(false);
    }
  };

  const handleSubmitAnswer = async () => {
    if (!activeQuestion || !userAnswer.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/study/sessions/${sessionId}/answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          questionId: activeQuestion.id,
          answer: userAnswer,
          hintsUsed: hintCount
        })
      });

      const data = await res.json();
      if (data.success) {
        setEvalResult(data.data);
      }
    } catch (err) {
      console.error('Failed to submit answer', err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleNext = () => {
    if (isGeneratingNextQuestion) return;
    if (isSpeaking) {
      ttsService.stop();
      setIsSpeaking(false);
    }
    setUserAnswer('');
    setEvalResult(null);
    setCurrentHint(null);
    setHintCount(0);
    onNextQuestion();
  };

  if (!activeQuestion) {
    return (
      <div className="p-8 text-center space-y-3 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
        <p className="text-xs text-slate-500 font-mono">
          {isGeneratingNextQuestion ? 'Generating next grounded unique question...' : 'No active question available. Ready for next question.'}
        </p>
        <button
          onClick={handleNext}
          disabled={isGeneratingNextQuestion}
          className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow transition disabled:opacity-50"
        >
          {isGeneratingNextQuestion ? 'Generating next question...' : 'Generate Next Question ➔'}
        </button>
      </div>
    );
  }

  return (
    <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-6 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <span className="text-[11px] font-mono text-indigo-600 dark:text-indigo-400 font-bold uppercase tracking-wider">
            {activeQuestion.questionType} Question • {activeQuestion.difficulty || 'BEGINNER'}
          </span>
          <h2 className="text-base font-semibold text-slate-900 dark:text-white leading-relaxed">
            {activeQuestion.question}
          </h2>
        </div>

        <button
          onClick={() => handleSpeakText(activeQuestion.question)}
          className={`p-2.5 rounded-xl border text-xs transition flex-shrink-0 ${
            isSpeaking
              ? 'bg-indigo-950 border-indigo-700 text-indigo-300 animate-pulse'
              : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
          }`}
          title="Listen to question"
        >
          <span>{isSpeaking ? '🔊 Playing...' : '🔈 Listen'}</span>
        </button>
      </div>

      {/* Options for MCQ / TRUE_FALSE */}
      {(activeQuestion.questionType === 'MCQ' || activeQuestion.questionType === 'TRUE_FALSE') && Array.isArray(activeQuestion.options) && (
        <div className="grid grid-cols-1 gap-2.5">
          {activeQuestion.options.map((opt: string, idx: number) => (
            <button
              key={idx}
              onClick={() => setUserAnswer(opt)}
              className={`p-3.5 rounded-xl text-xs text-left border transition ${
                userAnswer === opt
                  ? 'bg-indigo-50 dark:bg-indigo-950 border-indigo-500 text-slate-900 dark:text-white font-semibold'
                  : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-slate-400 dark:hover:border-slate-600'
              }`}
            >
              <span className="font-mono text-indigo-600 dark:text-indigo-400 mr-2 font-bold">{String.fromCharCode(65 + idx)}.</span>
              <span>{opt}</span>
            </button>
          ))}
        </div>
      )}

      {/* Short Answer / Scenario Textarea */}
      {activeQuestion.questionType !== 'MCQ' && activeQuestion.questionType !== 'TRUE_FALSE' && (
        <div className="space-y-2">
          <textarea
            value={userAnswer}
            onChange={(e) => setUserAnswer(e.target.value)}
            placeholder="Type your answer or response..."
            rows={4}
            className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-3 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-indigo-500 resize-none"
          />
        </div>
      )}

      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
        <button
          type="button"
          onClick={handleFetchHint}
          disabled={fetchingHint || hintCount >= 3}
          className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:text-amber-600 dark:hover:text-amber-300 text-xs font-semibold transition disabled:opacity-50"
        >
          <span>💡 Hint ({3 - hintCount} left)</span>
        </button>

        <button
          onClick={handleSubmitAnswer}
          disabled={submitting || !userAnswer.trim()}
          className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow transition disabled:opacity-50"
        >
          {submitting ? 'Evaluating...' : 'Submit Answer ✨'}
        </button>
      </div>

      {/* Display Hint */}
      {currentHint && (
        <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-amber-900 dark:text-amber-200 text-xs space-y-1">
          <span className="font-bold">💡 Hint {hintCount}:</span>
          <p>{currentHint}</p>
        </div>
      )}

      {/* Evaluation Result Toast */}
      {evalResult && (
        <div
          className={`p-5 rounded-2xl border space-y-3 ${
            evalResult.isCorrect
              ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-800/60 text-emerald-900 dark:text-emerald-200'
              : 'bg-rose-50 dark:bg-rose-950/60 border-rose-200 dark:border-rose-800/60 text-rose-900 dark:text-rose-200'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="font-bold text-sm">
              {evalResult.isCorrect ? '✅ Correct Answer!' : '❌ Needs Improvement'}
            </span>
            <span className="font-mono text-xs font-bold px-2.5 py-1 rounded bg-black/10 dark:bg-black/40">
              Score: {evalResult.score} / 10
            </span>
          </div>

          <p className="text-xs leading-relaxed">{evalResult.feedback}</p>

          {evalResult.explanation && (
            <div className="text-xs pt-2 border-t border-black/10 dark:border-white/10 space-y-1">
              <span className="font-semibold">Explanation:</span>
              <p className="opacity-90">{evalResult.explanation}</p>
            </div>
          )}

          <div className="pt-2 flex justify-end">
            <button
              onClick={handleNext}
              disabled={isGeneratingNextQuestion}
              className="px-4 py-2 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-950 font-bold text-xs hover:opacity-90 transition disabled:opacity-50"
            >
              {isGeneratingNextQuestion ? 'Generating next question...' : 'Next Question ➔'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
