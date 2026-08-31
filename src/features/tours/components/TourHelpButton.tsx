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
        className="flex items-center justify-center w-8 h-8 rounded-full bg-surface border border-border text-muted-foreground hover:text-foreground hover:border-primary/50 text-xs font-bold transition-colors duration-150"
        title="Help & Tour Guidance"
        aria-label="Help and Module Guidance"
      >
        ?
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-72 rounded-2xl bg-surface border border-border p-4 shadow-2xl z-50 animate-dropdown-in space-y-3 text-foreground">
          <div className="flex items-center justify-between border-b border-border pb-2">
            <h4 className="font-bold text-sm text-foreground">{activeTour.module} Guidance</h4>
            <button onClick={() => setIsOpen(false)} className="text-muted-foreground hover:text-foreground text-xs">
              ✕
            </button>
          </div>

          <p className="text-xs text-muted-foreground leading-relaxed">
            {activeTour.description || `Learn how to use ${activeTour.module} effectively.`}
          </p>

          <div className="pt-1 flex flex-col gap-2">
            <button
              onClick={() => {
                setIsOpen(false);
                startTour(activeTour.id);
              }}
              className="w-full py-1.5 bg-primary hover:bg-primary-hover text-primary-foreground rounded-xl text-xs font-semibold shadow-md shadow-primary/20 transition-colors duration-150"
            >
              Take {activeTour.module} Tour ✨
            </button>
            <button
              onClick={() => {
                setIsOpen(false);
                restartTour();
              }}
              className="w-full py-1.5 bg-muted hover:bg-surface-hover text-muted-foreground text-xs font-medium rounded-xl transition-colors duration-150"
            >
              Restart Tour 🔄
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
