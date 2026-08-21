'use client';

import React from 'react';

interface ChillFocusControlsProps {
  isPaused: boolean;
  onPauseToggle: () => void;
  onExit: () => void;
}

export const ChillFocusControls: React.FC<ChillFocusControlsProps> = ({
  isPaused,
  onPauseToggle,
  onExit
}) => {
  return (
    <div className="flex items-center space-x-3">
      <button
        type="button"
        onClick={onPauseToggle}
        className={`px-4 py-2 rounded-full text-xs font-bold transition flex items-center space-x-1.5 border shadow-lg ${
          isPaused
            ? 'bg-emerald-950/80 hover:bg-emerald-900 border-emerald-800 text-emerald-300'
            : 'bg-slate-900/80 hover:bg-slate-800 border-slate-800 text-slate-300'
        }`}
      >
        <span>{isPaused ? '▶ Resume' : '⏸ Pause'}</span>
      </button>

      <button
        type="button"
        onClick={onExit}
        aria-label="Exit Chill & Focus Mode"
        className="px-4 py-2 rounded-full bg-slate-900/80 hover:bg-slate-800 border border-slate-800 text-xs font-bold text-slate-300 hover:text-white transition flex items-center space-x-1.5 shadow-lg"
      >
        <span>✕</span>
        <span>Exit Mode</span>
      </button>
    </div>
  );
};
