'use client';

import React from 'react';

export function TourProgress({ currentStep, totalSteps, onSelectStep }: { currentStep: number; totalSteps: number; onSelectStep: (_idx: number) => void }) {
  return (
    <div className="flex items-center justify-center space-x-1.5 py-1">
      {Array.from({ length: totalSteps }).map((_item, idx) => (
        <button
          key={idx}
          onClick={() => onSelectStep(idx)}
          className={`h-2 rounded-full transition-all ${
            idx === currentStep ? 'w-6 bg-indigo-500' : 'w-2 bg-slate-700 hover:bg-slate-500'
          }`}
          aria-label={`Go to step ${idx + 1}`}
        />
      ))}
    </div>
  );
}
