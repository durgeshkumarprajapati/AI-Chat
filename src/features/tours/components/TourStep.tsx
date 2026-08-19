'use client';

import React from 'react';
import { TourStepDefinition } from '../tour-types';

export function TourStep({ step, isTargetFound }: { step: TourStepDefinition; isTargetFound: boolean }) {
  return (
    <div className="space-y-3 py-1">
      {!isTargetFound && (
        <div className="p-3 rounded-xl bg-amber-950/60 border border-amber-800/60 text-amber-300 text-xs">
          ⚠️ {step.emptyStateExplanation || 'This step is unavailable because this feature is not currently visible.'}
        </div>
      )}

      <p className="text-sm text-slate-200 leading-relaxed">{step.description}</p>

      {step.technicalDetails && (
        <div className="rounded-xl bg-slate-950 border border-slate-800 p-3 space-y-1">
          <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider">Under The Hood</span>
          <p className="text-xs font-mono text-slate-300">{step.technicalDetails}</p>
        </div>
      )}
    </div>
  );
}
