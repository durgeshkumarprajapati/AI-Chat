'use client';

import React from 'react';

interface AiInterventionBubbleProps {
  message?: string;
  onDismiss?: () => void;
}

export const AiInterventionBubble: React.FC<AiInterventionBubbleProps> = ({
  message = "You've been studying for 52 minutes. Let's take a 5-minute break.",
  onDismiss
}) => {
  return (
    <div className="bg-slate-900/90 backdrop-blur-md border border-slate-800 rounded-2xl p-4 max-w-md w-full shadow-2xl space-y-2 relative transition-all duration-300">
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="absolute top-3 right-3 text-slate-400 hover:text-white text-xs p-1 rounded-lg bg-slate-950/60 border border-slate-800"
          aria-label="Dismiss AI break suggestion"
        >
          ✕
        </button>
      )}

      <div className="flex items-start space-x-3">
        <div className="w-8 h-8 rounded-xl bg-indigo-600/30 border border-indigo-500/40 flex items-center justify-center text-indigo-300 text-sm flex-shrink-0 mt-0.5">
          🤖
        </div>

        <div className="space-y-1 pr-4">
          <p className="text-xs text-slate-200 leading-relaxed font-medium">
            {message}
          </p>
          <div className="text-[10px] font-mono text-indigo-400 font-semibold uppercase tracking-wider">
            Document AI Copilot
          </div>
        </div>
      </div>
    </div>
  );
};
