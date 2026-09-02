'use client';

import React from 'react';
import Link from 'next/link';
import { useWorkspace } from '@/context/WorkspaceContext';

export const FinalCTA: React.FC = () => {
  const { authStatus } = useWorkspace();
  const primaryTarget = authStatus === 'AUTHENTICATED' ? '/dashboard' : '/register';
  const secondaryTarget = authStatus === 'AUTHENTICATED' ? '/dashboard' : '/login';

  return (
    <section className="py-24 bg-gradient-to-b from-[#0f131d] via-[#0a0e18] to-[#0a0e18] relative overflow-hidden">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative z-10">
        <div className="bg-[#0f131d]/90 border border-[#424754] rounded-3xl p-10 sm:p-16 space-y-8 shadow-2xl relative">
          <div className="w-16 h-16 rounded-3xl bg-gradient-to-tr from-[#4d8eff] to-[#4edea3] flex items-center justify-center text-3xl text-[#0a0e18] font-bold mx-auto shadow-xl shadow-[#4d8eff]/20">
            🚀
          </div>

          <div className="space-y-3 max-w-2xl mx-auto">
            <h2 className="text-3xl sm:text-5xl font-extrabold text-[#dfe2f1] font-sans tracking-tight">
              Ready to Intelligence Your Data?
            </h2>
            <p className="text-base sm:text-lg text-[#c2c6d6] leading-relaxed">
              Build, explore, and collaborate with AI across your enterprise documents, knowledge bases, and workflows.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-4 pt-4">
            <Link
              href={primaryTarget}
              className="px-8 py-4 rounded-xl bg-gradient-to-r from-[#4d8eff] to-[#adc6ff] text-[#0a0e18] font-bold text-sm shadow-xl shadow-[#4d8eff]/30 hover:scale-[1.02] active:scale-[0.98] transition-all"
            >
              {authStatus === 'AUTHENTICATED' ? 'Enter Application' : 'Start Free Trial'}
            </Link>

            <Link
              href={secondaryTarget}
              className="px-8 py-4 rounded-xl bg-[#0a0e18] hover:bg-[#0a0e18]/80 border border-[#424754] text-[#dfe2f1] hover:border-[#8c909f] font-bold text-sm shadow-lg transition-all"
            >
              {authStatus === 'AUTHENTICATED' ? 'Go to Dashboard' : 'Account Sign In'}
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
};
