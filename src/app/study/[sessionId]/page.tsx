'use client';

import { useState, useEffect } from 'react';
import { TeachMode } from './TeachMode';
import { SocraticMode } from './SocraticMode';
import { QuizMode } from './QuizMode';
import { FlashcardMode } from './FlashcardMode';
import { PracticeMode } from './PracticeMode';
import { ReviewMode } from './ReviewMode';

export default function StudySessionPage({ params }: { params: { sessionId: string } }) {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [currentMode, setCurrentMode] = useState<string>('TEACH');

  const [activeTopicIndex, setActiveTopicIndex] = useState<number>(0);
  const [activeQuestion, setActiveQuestion] = useState<any>(null);

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
  }, [params.sessionId]);

  const handleNextQuestion = async () => {
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

  const handleSelectReviewTopic = (topicId: string) => {
    if (!session || !session.topics) return;
    const idx = session.topics.findIndex((t: any) => t.id === topicId);
    if (idx !== -1) {
      setActiveTopicIndex(idx);
      setCurrentMode('QUIZ');
      handleNextQuestion();
    }
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto p-12 text-center text-xs text-slate-400 font-mono">
        Loading grounded study session...
      </div>
    );
  }

  if (!session) {
    return (
      <div className="max-w-4xl mx-auto p-12 text-center text-xs text-rose-400 font-mono">
        Study session not found.
      </div>
    );
  }

  const currentTopic = session.topics?.[activeTopicIndex];

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
        <div>
          <div className="flex items-center space-x-2">
            <span className="text-xs font-bold px-2.5 py-0.5 rounded bg-indigo-100 dark:bg-indigo-950 text-indigo-800 dark:text-indigo-300 border border-indigo-300 dark:border-indigo-800 font-mono">
              {session.difficulty}
            </span>
            <h1 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">{session.title}</h1>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-1">
            Topic {activeTopicIndex + 1} of {session.topics?.length}: {currentTopic?.title}
          </p>
        </div>

        {/* Mastery Progress */}
        <div className="w-full md:w-48 space-y-1">
          <div className="flex justify-between text-[11px] font-mono text-slate-500 dark:text-slate-400">
            <span>Overall Mastery</span>
            <span className="text-indigo-600 dark:text-indigo-400 font-bold">{session.progressPercent}%</span>
          </div>
          <div className="w-full bg-slate-200 dark:bg-slate-800 rounded-full h-2 overflow-hidden">
            <div
              className="bg-indigo-600 dark:bg-indigo-500 h-2 rounded-full transition-all duration-300"
              style={{ width: `${session.progressPercent}%` }}
            />
          </div>
        </div>
      </div>

      {/* Mode Selector Tabs */}
      <div className="flex overflow-x-auto space-x-2 pb-2 scrollbar-none">
        {[
          { id: 'TEACH', label: '📖 Teach' },
          { id: 'SOCRATIC', label: '🤔 Socratic' },
          { id: 'QUIZ', label: '📝 Quiz' },
          { id: 'FLASHCARDS', label: '🎴 Flashcards' },
          { id: 'PRACTICE', label: '🛠️ Practice' },
          { id: 'REVIEW', label: '🔄 Review' }
        ].map((m) => (
          <button
            key={m.id}
            onClick={() => setCurrentMode(m.id)}
            className={`px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition border ${
              currentMode === m.id
                ? 'bg-indigo-600 border-indigo-500 text-white shadow-md'
                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Mode Content Views */}
      {currentMode === 'TEACH' && <TeachMode sessionId={params.sessionId} />}

      {currentMode === 'SOCRATIC' && (
        <SocraticMode sessionId={params.sessionId} topicId={currentTopic?.id} />
      )}

      {currentMode === 'QUIZ' && (
        <QuizMode
          sessionId={params.sessionId}
          activeQuestion={activeQuestion}
          onNextQuestion={handleNextQuestion}
        />
      )}

      {currentMode === 'FLASHCARDS' && (
        <FlashcardMode sessionId={params.sessionId} topicId={currentTopic?.id} />
      )}

      {currentMode === 'PRACTICE' && (
        <PracticeMode sessionId={params.sessionId} topicId={currentTopic?.id} />
      )}

      {currentMode === 'REVIEW' && (
        <ReviewMode
          sessionId={params.sessionId}
          onSelectReviewTopic={handleSelectReviewTopic}
        />
      )}
    </div>
  );
}
