'use client';

import React from 'react';

interface AuthBrandHeaderProps {
  title?: string;
  subtitle: string;
}

export const AuthBrandHeader: React.FC<AuthBrandHeaderProps> = ({
  title = 'Document AI RAG',
  subtitle
}) => {
  return (
    <div className="text-center space-y-3 font-sans">
      {/* Brand Icon & Name Row */}
      <div className="inline-flex items-center justify-center space-x-2.5 bg-[#0a0e18] px-4 py-2 rounded-2xl border border-[#424754]/80 shadow-lg">
        <div className="h-7 w-7 rounded-xl bg-gradient-to-br from-[#4d8eff] to-[#adc6ff] flex items-center justify-center font-extrabold text-[#0a0e18] text-xs shadow-md">
          AI
        </div>
        <span className="text-base font-extrabold text-[#dfe2f1] tracking-tight font-sans">
          {title}
        </span>
      </div>

      {/* Subtitle */}
      <p className="text-xs text-[#8c909f] font-sans font-medium">
        {subtitle}
      </p>
    </div>
  );
};
