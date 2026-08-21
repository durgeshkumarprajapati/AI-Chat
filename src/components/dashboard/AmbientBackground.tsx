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
      {/* Primary Midnight Surface */}
      <div className="absolute inset-0 bg-[#0f131d]" />

      {/* Top Left Soft Radial Glow */}
      <div
        className={`absolute -top-40 -left-40 w-[600px] h-[600px] rounded-full bg-gradient-to-br from-[#4d8eff]/12 via-[#1c1f2a]/10 to-transparent blur-3xl opacity-70 ${
          reducedMotion ? '' : 'animate-pulse'
        }`}
        style={{ animationDuration: '8s' }}
      />

      {/* Bottom Right Soft Emerald/Blue Glow */}
      <div
        className={`absolute -bottom-40 -right-40 w-[700px] h-[700px] rounded-full bg-gradient-to-tl from-[#4edea3]/8 via-[#4d8eff]/10 to-transparent blur-3xl opacity-60 ${
          reducedMotion ? '' : 'animate-pulse'
        }`}
        style={{ animationDuration: '12s' }}
      />

      {/* Subtle Noise / Grid Texture */}
      <div className="absolute inset-0 bg-[radial-gradient(#4d8eff_1px,transparent_1px)] [background-size:32px_32px] opacity-[0.03]" />
    </div>
  );
};
