'use client';

import { useState, useEffect } from 'react';
import { FlashcardItem } from '@/features/study/modes/flashcards.service';

export function FlashcardMode({ sessionId, topicId }: { sessionId: string; topicId?: string }) {
  const [cards, setCards] = useState<FlashcardItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadCards() {
      if (!topicId) return;
      try {
        const res = await fetch(`/api/study/sessions/${sessionId}/flashcards`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ topicId })
        });
        const data = await res.json();
        if (data.success && Array.isArray(data.data)) {
          setCards(data.data);
        }
      } catch (err) {
        console.error('Failed to load flashcards', err);
      } finally {
        setLoading(false);
      }
    }

    loadCards();
  }, [sessionId, topicId]);

  const handleRate = async (rating: 'AGAIN' | 'HARD' | 'GOOD' | 'EASY') => {
    const card = cards[currentIndex];
    if (!card) return;

    try {
      await fetch(`/api/study/sessions/${sessionId}/flashcards/${card.id}/rate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating })
      });

      setIsFlipped(false);
      if (currentIndex < cards.length - 1) {
        setCurrentIndex((prev) => prev + 1);
      } else {
        setCurrentIndex(0); // loop back or completed
      }
    } catch (err) {
      console.error('Failed to rate flashcard', err);
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-xs text-slate-400 font-mono">Generating grounded flashcards...</div>;
  }

  if (cards.length === 0) {
    return <div className="p-8 text-center text-xs text-slate-500 font-mono">No flashcards available for this topic yet.</div>;
  }

  const currentCard = cards[currentIndex];

  return (
    <div className="space-y-6">
      {/* Card Container */}
      <div className="flex flex-col items-center space-y-4">
        <div className="text-xs text-slate-400 font-mono">
          Card {currentIndex + 1} of {cards.length}
        </div>

        <div
          onClick={() => setIsFlipped(!isFlipped)}
          className="w-full max-w-lg h-64 cursor-pointer p-8 rounded-2xl bg-white dark:bg-slate-900 border-2 border-indigo-200 dark:border-indigo-900/60 shadow-lg hover:border-indigo-500 transition-all flex flex-col items-center justify-center text-center space-y-4 relative"
        >
          <span className="absolute top-4 right-4 text-[10px] font-mono text-indigo-500 font-bold px-2 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950">
            {isFlipped ? 'BACK (Explanation)' : 'FRONT (Click to Flip)'}
          </span>

          <p className="text-base font-medium text-slate-900 dark:text-white leading-relaxed">
            {isFlipped ? currentCard?.back : currentCard?.front}
          </p>

          <span className="text-xs text-slate-400 italic">
            {isFlipped ? 'Click card to see question' : 'Click card to reveal answer'}
          </span>
        </div>

        {/* Rating Controls */}
        {isFlipped && (
          <div className="flex items-center space-x-2 pt-4">
            <button
              onClick={() => handleRate('AGAIN')}
              className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition shadow"
            >
              🔴 Again (1d)
            </button>
            <button
              onClick={() => handleRate('HARD')}
              className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold transition shadow"
            >
              🟠 Hard (2d)
            </button>
            <button
              onClick={() => handleRate('GOOD')}
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition shadow"
            >
              🔵 Good (4d)
            </button>
            <button
              onClick={() => handleRate('EASY')}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition shadow"
            >
              🟢 Easy (7d)
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
