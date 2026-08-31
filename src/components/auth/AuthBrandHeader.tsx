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
      <div className="inline-flex items-center justify-center space-x-2.5 bg-card px-4 py-2 rounded-2xl border border-card-border shadow-lg">
        <div className="h-7 w-7 rounded-xl bg-gradient-to-br from-primary to-primary-hover flex items-center justify-center font-extrabold text-primary-foreground text-xs shadow-md">
          AI
        </div>
        <span className="text-base font-extrabold text-foreground tracking-tight font-sans">
          {title}
        </span>
      </div>

      {/* Subtitle */}
      <p className="text-xs text-muted-foreground font-sans font-medium">
        {subtitle}
      </p>
    </div>
  );
};
