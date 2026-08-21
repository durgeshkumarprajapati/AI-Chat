'use client';

import React from 'react';
import Link from 'next/link';

export const AppFooter: React.FC = () => {
  return (
    <footer className="w-full border-t border-[#424754]/60 bg-[#0a0e18]/80 backdrop-blur-md py-4 px-4 sm:px-6 lg:px-8 mt-auto text-xs font-sans text-[#c2c6d6] transition-colors select-none">
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
        {/* Left Brand Copyright */}
        <div className="flex items-center space-x-2 text-[11px]">
          <span className="w-2 h-2 rounded-full bg-[#4edea3]" />
          <span className="font-mono font-bold text-[#dfe2f1]">
            © 2026 Document AI Enterprise Platform
          </span>
        </div>

        {/* Right Navigation Links */}
        <nav aria-label="Application Footer Navigation" className="flex flex-wrap items-center justify-center gap-4 sm:gap-6 text-xs text-[#c2c6d6]">
          <Link href="/terms-and-conditions" className="hover:text-[#adc6ff] transition-colors">
            Terms & Conditions
          </Link>
          <Link href="/contact-us" className="hover:text-[#adc6ff] transition-colors">
            Contact Support
          </Link>
          <Link href="/documents" className="hover:text-[#adc6ff] transition-colors">
            Documentation
          </Link>
          <Link href="/health" className="hover:text-[#adc6ff] transition-colors">
            System Status
          </Link>
        </nav>
      </div>
    </footer>
  );
};
