'use client';

import React, { useState } from 'react';
import { useTour } from './TourProvider';
import { useContextualTour } from '../hooks/useContextualTour';

export function TourHelpButton() {
  const { startTour, restartTour } = useTour();
  const { activeTour } = useContextualTour();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative inline-block text-left">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-center w-8 h-8 rounded-full bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:border-slate-700 text-xs font-bold transition"
        title="Help & Tour Guidance"
        aria-label="Help and Module Guidance"
      >
        ?
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-72 rounded-2xl bg-slate-900 border border-slate-800 p-4 shadow-2xl z-50 animate-in fade-in zoom-in-95 duration-150 space-y-3 text-slate-200">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <h4 className="font-bold text-sm text-white">{activeTour.module} Guidance</h4>
            <button onClick={() => setIsOpen(false)} className="text-slate-400 hover:text-white text-xs">
              ✕
            </button>
          </div>

          <p className="text-xs text-slate-300 leading-relaxed">
            {activeTour.description || `Learn how to use ${activeTour.module} effectively.`}
          </p>

          <div className="pt-1 flex flex-col gap-2">
            <button
              onClick={() => {
                setIsOpen(false);
                startTour(activeTour.id);
              }}
              className="w-full py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold shadow-md shadow-indigo-600/20 transition"
            >
              Take {activeTour.module} Tour ✨
            </button>
            <button
              onClick={() => {
                setIsOpen(false);
                restartTour();
              }}
              className="w-full py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-xl transition"
            >
              Restart Tour 🔄
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
