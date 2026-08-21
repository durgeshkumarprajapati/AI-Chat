'use client';

import React from 'react';
import { CalmStreakSummaryDTO, ChillFocusSessionDTO } from '@/features/chill-focus/chill-focus.types';

interface SessionSummaryProps {
  session: ChillFocusSessionDTO;
  streak?: CalmStreakSummaryDTO | null;
  onClose: () => void;
}

export const SessionSummary: React.FC<SessionSummaryProps> = ({ session, streak, onClose }) => {
  const activeMinutes = Math.max(1, Math.round(session.activeDurationSeconds / 60));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 max-w-md w-full space-y-6 shadow-2xl text-center relative font-sans">
        <div className="w-16 h-16 rounded-full bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center text-3xl mx-auto">
          🧘
        </div>

        <div className="space-y-1">
          <h2 className="text-xl font-bold text-white tracking-tight">Session Completed</h2>
          <p className="text-xs text-slate-400">Great job resetting your mind and focusing!</p>
        </div>

        <div className="grid grid-cols-2 gap-3 text-xs font-mono bg-slate-950 p-4 rounded-2xl border border-slate-800">
          <div>
            <span className="text-slate-400 text-[10px] uppercase font-bold block">Active Duration</span>
            <span className="text-emerald-400 font-bold text-base">{activeMinutes} mins</span>
          </div>
          <div>
            <span className="text-slate-400 text-[10px] uppercase font-bold block">Calm Streak</span>
            <span className="text-amber-400 font-bold text-base">{streak?.currentStreakDays || 1} Days</span>
          </div>
        </div>

        <button
          onClick={onClose}
          className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl transition shadow-lg shadow-indigo-600/30"
        >
          Done 🚀
        </button>
      </div>
    </div>
  );
};
