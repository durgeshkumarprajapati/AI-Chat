'use client';

import React from 'react';
import { BreathingPhase } from '@/features/chill-focus/chill-focus.types';

interface ReducedMotionFallbackProps {
  phase: BreathingPhase;
  secondsLeft: number;
  isPaused?: boolean;
}

export const ReducedMotionFallback: React.FC<ReducedMotionFallbackProps> = ({
  phase,
  secondsLeft,
  isPaused = false
}) => {
  const phaseLabels: Record<BreathingPhase, { title: string; icon: string }> = {
    INHALE: { title: 'Breathe In', icon: '💨' },
    HOLD: { title: 'Hold', icon: '⏸' },
    EXHALE: { title: 'Breathe Out', icon: '😮‍💨' },
    REST: { title: 'Rest', icon: '🍃' }
  };

  const current = phaseLabels[phase];

  return (
    <div
      role="region"
      aria-label="Accessible Breathing Indicator"
      className="bg-slate-900/90 border border-slate-800 rounded-3xl p-8 max-w-sm w-full my-6 text-center space-y-4 shadow-xl"
    >
      <div className="text-3xl">{current.icon}</div>
      <div className="space-y-1">
        <h2 className="text-lg font-bold text-white">{current.title}</h2>
        <p className="text-xs font-mono text-indigo-400 font-semibold">{secondsLeft} seconds remaining</p>
      </div>

      <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden border border-slate-800">
        <div
          className={`h-full transition-all duration-500 ${
            isPaused ? 'bg-amber-500' : 'bg-indigo-500'
          }`}
          style={{ width: `${Math.min(100, Math.max(10, (secondsLeft / 6) * 100))}%` }}
        />
      </div>

      <p className="text-[11px] text-slate-400">
        Reduced motion mode active. Breathing timing is preserved.
      </p>
    </div>
  );
};
