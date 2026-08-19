'use client';

import React from 'react';

export function TourOverlay({ rect }: { rect: DOMRect | null }) {
  if (!rect) return null;

  return (
    <div
      className="fixed pointer-events-none rounded-xl border-2 border-indigo-400 shadow-[0_0_30px_rgba(99,102,241,0.5)] transition-all duration-300 z-50"
      style={{
        top: Math.max(0, rect.top - 6),
        left: Math.max(0, rect.left - 6),
        width: rect.width + 12,
        height: rect.height + 12
      }}
    />
  );
}
