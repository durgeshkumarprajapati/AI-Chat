'use client';

import React, { useEffect, useState } from 'react';

interface AuthLayoutShellProps {
  children: React.ReactNode;
}

export const AuthLayoutShell: React.FC<AuthLayoutShellProps> = ({ children }) => {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(motionQuery.matches);
  }, []);

  return (
    <div className="min-h-screen bg-surface text-foreground font-sans flex flex-col justify-center items-center py-12 px-4 sm:px-6 lg:px-8 relative overflow-hidden select-none">
      {/* Background Soft Blue Radial Glow */}
      <div
        className={`absolute -top-32 w-[600px] h-[600px] rounded-full bg-gradient-to-b from-primary/10 via-surface-hover/10 to-transparent blur-3xl opacity-70 pointer-events-none ${
          reducedMotion ? '' : 'animate-pulse'
        }`}
        style={{ animationDuration: '8s' }}
      />

      {/* Background Grid Pattern — decorative dot-grid at 3% opacity; left as a literal hex
          since it's embedded inside a raw radial-gradient() function, not a themeable
          bg-[#hex] utility, and is too subtle to visibly differ between themes. */}
      <div className="absolute inset-0 bg-[radial-gradient(#4d8eff_1px,transparent_1px)] [background-size:32px_32px] opacity-[0.03] pointer-events-none" />

      {/* Main Content Container */}
      <div className="relative z-10 w-full max-w-md space-y-6">
        {children}
      </div>
    </div>
  );
};
