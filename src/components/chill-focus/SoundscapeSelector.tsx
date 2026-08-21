'use client';

import React from 'react';
import { SOUNDSCAPES } from '@/features/chill-focus/chill-focus.constants';

interface SoundscapeSelectorProps {
  selectedId: string;
  onSelect: (_soundscapeId: string) => void;
  disabled?: boolean;
}

export const SoundscapeSelector: React.FC<SoundscapeSelectorProps> = ({
  selectedId,
  onSelect,
  disabled = false
}) => {
  return (
    <div className="w-full max-w-4xl mx-auto space-y-3 font-sans">
      <div className="text-[11px] font-mono font-bold uppercase tracking-widest text-slate-400 text-center">
        SOUNDSCAPES
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {SOUNDSCAPES.map((item) => {
          const isSelected = selectedId.toLowerCase() === item.id.toLowerCase();
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item.id)}
              disabled={disabled}
              aria-pressed={isSelected}
              aria-label={`Select soundscape ${item.name}`}
              className={`flex flex-col items-center justify-center p-4 rounded-2xl border transition-all duration-300 ${
                isSelected
                  ? 'bg-gradient-to-b from-sky-900/80 to-indigo-950/90 border-sky-400 text-white shadow-xl shadow-sky-500/20 scale-105'
                  : 'bg-slate-900/60 hover:bg-slate-800/80 border-slate-800 text-slate-300 hover:text-white'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              <span className="text-2xl mb-1.5">{item.icon}</span>
              <span className="text-xs font-bold font-mono tracking-tight">{item.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
