'use client';

import React from 'react';

interface CalmStreakBadgeProps {
  streakDays: number;
  earnedToday?: boolean;
}

export const CalmStreakBadge: React.FC<CalmStreakBadgeProps> = ({ streakDays, earnedToday = false }) => {
  return (
    <div
      role="status"
      aria-label={`Calm Streak: ${streakDays} days`}
      className="inline-flex items-center space-x-2 bg-slate-900/80 backdrop-blur-md border border-slate-800 rounded-full px-4 py-2 text-xs font-bold text-amber-300 shadow-lg"
    >
      <span className="text-amber-400 text-sm">🔥</span>
      <span>Calm Streak: {streakDays} Day{streakDays === 1 ? '' : 's'}</span>
      {earnedToday && (
        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" title="Earned today" />
      )}
    </div>
  );
};
