'use client';

import React from 'react';

interface ChillFocusModeToggleProps {
  mode: 'CHILL' | 'FOCUS';
  onModeChange: (_mode: 'CHILL' | 'FOCUS') => void;
  disabled?: boolean;
}

export const ChillFocusModeToggle: React.FC<ChillFocusModeToggleProps> = ({
  mode,
  onModeChange,
  disabled = false
}) => {
  return (
    <div
      role="group"
      aria-label="Select Mode"
      className="inline-flex items-center p-1 bg-slate-900/80 backdrop-blur-md border border-slate-800 rounded-full shadow-lg"
    >
      <button
        type="button"
        onClick={() => onModeChange('CHILL')}
        disabled={disabled}
        aria-pressed={mode === 'CHILL'}
        className={`flex items-center space-x-2 px-5 py-2 rounded-full text-xs font-bold transition-all duration-300 ${
          mode === 'CHILL'
            ? 'bg-gradient-to-r from-sky-600 to-indigo-600 text-white shadow-md shadow-sky-600/30 scale-105'
            : 'text-slate-400 hover:text-slate-200'
        } disabled:opacity-50`}
      >
        <span>🍃</span>
        <span>Chill</span>
      </button>

      <button
        type="button"
        onClick={() => onModeChange('FOCUS')}
        disabled={disabled}
        aria-pressed={mode === 'FOCUS'}
        className={`flex items-center space-x-2 px-5 py-2 rounded-full text-xs font-bold transition-all duration-300 ${
          mode === 'FOCUS'
            ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-md shadow-indigo-600/30 scale-105'
            : 'text-slate-400 hover:text-slate-200'
        } disabled:opacity-50`}
      >
        <span>🎯</span>
        <span>Focus</span>
      </button>
    </div>
  );
};
