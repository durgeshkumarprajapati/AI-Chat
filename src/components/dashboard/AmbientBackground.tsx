'use client';

import React, { useEffect, useState } from 'react';

export const AmbientBackground: React.FC = () => {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(motionQuery.matches);
  }, []);

  return (
    <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden select-none">
      {/* Primary Surface — Phase 77A: was a solid hardcoded dark fill (bg-[#0f131d]) with no
          light-mode value, so the dashboard rendered dark regardless of the user's theme. */}
      <div className="absolute inset-0 bg-background" />

      {/* Top Left Soft Radial Glow */}
      <div
        className={`absolute -top-40 -left-40 w-[600px] h-[600px] rounded-full bg-gradient-to-br from-primary/12 via-surface-hover/10 to-transparent blur-3xl opacity-70 ${
          reducedMotion ? '' : 'animate-pulse'
        }`}
        style={{ animationDuration: '8s' }}
      />

      {/* Bottom Right Soft Emerald/Blue Glow */}
      <div
        className={`absolute -bottom-40 -right-40 w-[700px] h-[700px] rounded-full bg-gradient-to-tl from-success/8 via-primary/10 to-transparent blur-3xl opacity-60 ${
          reducedMotion ? '' : 'animate-pulse'
        }`}
        style={{ animationDuration: '12s' }}
      />

      {/* Subtle Noise / Grid Texture */}
      <div className="absolute inset-0 bg-[radial-gradient(#4d8eff_1px,transparent_1px)] [background-size:32px_32px] opacity-[0.03]" />
    </div>
  );
};
