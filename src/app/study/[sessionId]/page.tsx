'use client';

import { useState, useEffect } from 'react';
import { speechToTextService, VoiceState } from '@/features/voice';
import { ttsService } from '@/features/tts/tts.service';

export default function StudySessionPage({ params }: { params: { sessionId: string } }) {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [currentMode, setCurrentMode] = useState<string>('TEACH');

  const [activeTopicIndex] = useState<number>(0);
  const [activeQuestion, setActiveQuestion] = useState<any>(null);
  const [userAnswer, setUserAnswer] = useState<string>('');

  const [submitting, setSubmitting] = useState(false);
  const [evalResult, setEvalResult] = useState<any>(null);

  // Voice Input (Phase 32)
  const [voiceState, setVoiceState] = useState<VoiceState>('IDLE');

  // TTS (Phase 29)
  const [isSpeaking, setIsSpeaking] = useState(false);

  // Hints (Phase 33)
  const [hintCount, setHintCount] = useState(0);
  const [currentHint, setCurrentHint] = useState<string | null>(null);
  const [fetchingHint, setFetchingHint] = useState(false);

  useEffect(() => {
    async function loadSession() {
      try {
        const res = await fetch(`/api/study/sessions/${params.sessionId}`);
        const data = await res.json();
        if (data.success) {
          setSession(data.data);
          setCurrentMode(data.data.currentMode || 'TEACH');

          const topic = data.data.topics?.[0];
          if (topic && topic.questions?.length > 0) {
            setActiveQuestion(topic.questions[0]);
          }
        }
      } catch (err) {
        console.error('Failed to load study session', err);
      } finally {
        setLoading(false);
      }
    }

    loadSession();

    const unsubVoiceState = speechToTextService.onStateChange((st) => setVoiceState(st));
    const unsubVoiceTranscript = speechToTextService.onTranscript((text, isFinal) => {
      if (isFinal) {
        setUserAnswer((prev) => (prev ? `${prev} ${text}`.trim() : text));
      }
    });

    return () => {
      unsubVoiceState();
      unsubVoiceTranscript();
    };
  }, [params.sessionId]);

  const handleToggleVoice = () => {
    if (voiceState === 'LISTENING' || voiceState === 'STARTING') {
      speechToTextService.stopListening();
    } else {
      speechToTextService.startListening();
    }
  };

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
      const res = await fetch(`/api/study/sessions/${params.sessionId}/hint`, {
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
      const res = await fetch(`/api/study/sessions/${params.sessionId}/answer`, {
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

  const handleNextQuestion = async () => {
    setUserAnswer('');
    setEvalResult(null);
    setCurrentHint(null);
    setHintCount(0);

    try {
      const res = await fetch(`/api/study/sessions/${params.sessionId}/next`, {
        method: 'POST'
      });
      const data = await res.json();
      if (data.success) {
        setActiveQuestion(data.data);
      }
    } catch (err) {
      console.error('Failed to fetch next question', err);
    }
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto p-12 text-center text-xs text-slate-400">
        Loading interactive study session...
      </div>
    );
  }

  if (!session) {
    return (
      <div className="max-w-4xl mx-auto p-12 text-center text-xs text-rose-400">
        Study session not found.
      </div>
    );
  }

  const currentTopic = session.topics?.[activeTopicIndex];

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      {/* Top Session Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
        <div>
          <div className="flex items-center space-x-2">
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
              {session.difficulty}
            </span>
            <h1 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">{session.title}</h1>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-1">
            Topic {activeTopicIndex + 1} of {session.topics?.length}: {currentTopic?.title}
          </p>
        </div>

        {/* Progress Bar */}
        <div className="w-full md:w-48 space-y-1">
          <div className="flex justify-between text-[11px] font-mono text-slate-600 dark:text-slate-400">
            <span>Mastery Progress</span>
            <span className="text-indigo-600 dark:text-indigo-400 font-bold">{session.progressPercent}%</span>
          </div>
          <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2 overflow-hidden">
            <div
              className="bg-indigo-500 h-2 rounded-full transition-all duration-300"
              style={{ width: `${session.progressPercent}%` }}
            />
          </div>
        </div>
      </div>

      {/* Mode Selector Bar */}
      <div className="flex overflow-x-auto space-x-2 pb-2 scrollbar-none">
        {['TEACH', 'SOCRATIC', 'QUIZ', 'FLASHCARDS', 'PRACTICE', 'REVIEW'].map((m) => (
          <button
            key={m}
            onClick={() => setCurrentMode(m)}
            className={`px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition border ${
              currentMode === m
                ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-600/20'
                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white shadow-sm'
            }`}
          >
            {m === 'TEACH' && '📖 Teach'}
            {m === 'SOCRATIC' && '🤔 Socratic'}
            {m === 'QUIZ' && '📝 Quiz'}
            {m === 'FLASHCARDS' && '🎴 Flashcards'}
            {m === 'PRACTICE' && '🛠️ Practice'}
            {m === 'REVIEW' && '🔄 Review'}
          </button>
        ))}
      </div>

      {/* Question Card */}
      {activeQuestion ? (
        <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-6 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <span className="text-[11px] font-mono text-indigo-600 dark:text-indigo-400 uppercase tracking-wider font-semibold">
                {activeQuestion.questionType} Question
              </span>
              <h2 className="text-base font-semibold text-slate-900 dark:text-white leading-relaxed">
                {activeQuestion.question}
              </h2>
            </div>

            {/* TTS Playback */}
            <button
              onClick={() => handleSpeakText(activeQuestion.question)}
              className={`p-2.5 rounded-xl border text-xs transition flex-shrink-0 ${
                isSpeaking
                  ? 'bg-indigo-50 dark:bg-indigo-950 border-indigo-300 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300 animate-pulse'
                  : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
              title="Listen to question"
            >
              <span>{isSpeaking ? '🔊 Playing...' : '🔈 Listen'}</span>
            </button>
          </div>

          {/* Options for MCQ */}
          {activeQuestion.questionType === 'MCQ' && Array.isArray(activeQuestion.options) && (
            <div className="grid grid-cols-1 gap-2.5">
              {activeQuestion.options.map((opt: string, idx: number) => (
                <button
                  key={idx}
                  onClick={() => setUserAnswer(opt)}
                  className={`p-3.5 rounded-xl text-xs text-left border transition ${
                    userAnswer === opt
                      ? 'bg-indigo-50 dark:bg-indigo-950 border-indigo-500 text-indigo-900 dark:text-white font-semibold shadow-sm'
                      : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-700'
                  }`}
                >
                  <span className="font-mono text-indigo-600 dark:text-indigo-400 font-bold mr-2">{String.fromCharCode(65 + idx)}.</span>
                  <span>{opt}</span>
                </button>
              ))}
            </div>
          )}

          {/* Short Answer / Socratic Input */}
          {activeQuestion.questionType !== 'MCQ' && (
            <div className="space-y-2">
              <textarea
                value={userAnswer}
                onChange={(e) => setUserAnswer(e.target.value)}
                placeholder="Type your explanation or response..."
                rows={3}
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-3 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-indigo-500 resize-none"
              />
            </div>
          )}

          {/* Action Bar: Voice, Hint, Submit */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <div className="flex items-center space-x-2">
              {/* Voice Button */}
              <button
                type="button"
                onClick={handleToggleVoice}
                className={`px-3 py-2 rounded-xl text-xs font-semibold border flex items-center space-x-1.5 transition ${
                  voiceState === 'LISTENING'
                    ? 'bg-rose-100 dark:bg-rose-950 border-rose-300 dark:border-rose-700 text-rose-800 dark:text-rose-300 animate-pulse'
                    : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <span>{voiceState === 'LISTENING' ? '🔴' : '🎤'}</span>
                <span>{voiceState === 'LISTENING' ? 'Listening...' : 'Voice'}</span>
              </button>

              {/* Hint Button */}
              <button
                type="button"
                onClick={handleFetchHint}
                disabled={fetchingHint || hintCount >= 3}
                className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:text-amber-600 dark:hover:text-amber-300 text-xs font-semibold transition disabled:opacity-50"
              >
                <span>💡 Hint ({3 - hintCount} left)</span>
              </button>
            </div>

            <button
              onClick={handleSubmitAnswer}
              disabled={submitting || !userAnswer.trim()}
              className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-lg shadow-indigo-600/20 transition-all disabled:opacity-50"
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
                <div className="text-xs pt-2 border-t border-slate-200 dark:border-white/10 space-y-1">
                  <span className="font-semibold text-slate-900 dark:text-white">Explanation:</span>
                  <p className="opacity-90">{evalResult.explanation}</p>
                </div>
              )}

              <div className="pt-2 flex justify-end">
                <button
                  onClick={handleNextQuestion}
                  className="px-4 py-2 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-950 font-bold text-xs hover:bg-slate-800 dark:hover:bg-slate-200 transition shadow-sm"
                >
                  Next Question ➔
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="p-8 text-center space-y-3 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <p className="text-xs text-slate-500 dark:text-slate-400">All questions for this topic completed!</p>
          <button
            onClick={handleNextQuestion}
            className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition"
          >
            Generate Next Topic Questions ➔
          </button>
        </div>
      )}
    </div>
  );
}
