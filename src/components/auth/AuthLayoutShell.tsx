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
    <div className="min-h-screen bg-[#0f131d] text-[#dfe2f1] font-sans flex flex-col justify-center items-center py-12 px-4 sm:px-6 lg:px-8 relative overflow-hidden select-none">
      {/* Background Soft Blue Radial Glow */}
      <div
        className={`absolute -top-32 w-[600px] h-[600px] rounded-full bg-gradient-to-b from-[#4d8eff]/12 via-[#1c1f2a]/10 to-transparent blur-3xl opacity-70 pointer-events-none ${
          reducedMotion ? '' : 'animate-pulse'
        }`}
        style={{ animationDuration: '8s' }}
      />

      {/* Background Grid Pattern */}
      <div className="absolute inset-0 bg-[radial-gradient(#4d8eff_1px,transparent_1px)] [background-size:32px_32px] opacity-[0.03] pointer-events-none" />

      {/* Main Content Container */}
      <div className="relative z-10 w-full max-w-md space-y-6">
        {children}
      </div>
    </div>
  );
};
