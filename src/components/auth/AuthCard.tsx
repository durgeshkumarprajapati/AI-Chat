'use client';

import React from 'react';

interface AuthCardProps {
  children: React.ReactNode;
}

export const AuthCard: React.FC<AuthCardProps> = ({ children }) => {
  return (
    <div className="bg-[#0a0e18]/95 backdrop-blur-md border border-[#424754] rounded-2xl p-6 sm:p-8 shadow-2xl space-y-6 font-sans">
      {children}
    </div>
  );
};
