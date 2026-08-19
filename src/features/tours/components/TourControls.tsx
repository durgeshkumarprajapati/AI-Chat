'use client';

import React from 'react';

export function TourControls({
  isFirst,
  isLast,
  onPrev,
  onNext,
  onSkip
}: {
  isFirst: boolean;
  isLast: boolean;
  onPrev: () => void;
  onNext: () => void;
  onSkip: () => void;
}) {
  return (
    <div className="flex items-center justify-between pt-3 border-t border-slate-800">
      <button
        onClick={onPrev}
        disabled={isFirst}
        className={`px-4 py-2 text-xs font-semibold rounded-xl transition ${
          isFirst ? 'opacity-30 cursor-not-allowed text-slate-600' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
        }`}
      >
        ← Back
      </button>

      <div className="flex items-center space-x-3">
        <button
          onClick={onSkip}
          className="px-3 py-1.5 text-xs font-medium text-slate-400 hover:text-white transition"
        >
          Skip Tour
        </button>
        <button
          onClick={onNext}
          className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl shadow-lg shadow-indigo-600/25 transition transform active:scale-95"
        >
          {isLast ? 'Got it! 🎉' : 'Next →'}
        </button>
      </div>
    </div>
  );
}
