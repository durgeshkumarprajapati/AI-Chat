'use client';

import React from 'react';

interface AuthCardProps {
  children: React.ReactNode;
}

export const AuthCard: React.FC<AuthCardProps> = ({ children }) => {
  return (
    <div className="bg-card backdrop-blur-md border border-card-border rounded-2xl p-6 sm:p-8 shadow-2xl space-y-6 font-sans">
      {children}
    </div>
  );
};
