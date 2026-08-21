'use client';

import React from 'react';
import Link from 'next/link';

export const LandingFooter: React.FC = () => {
  return (
    <footer className="bg-[#0a0e18] border-t border-[#424754]/60 pt-16 pb-12 font-sans text-xs text-[#c2c6d6]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-8">
          {/* Brand Col */}
          <div className="col-span-2 space-y-4">
            <Link href="/" className="flex items-center space-x-3 group">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-[#4d8eff] to-[#4edea3] flex items-center justify-center font-bold text-[#0a0e18]">
                AI
              </div>
              <span className="font-extrabold text-base text-[#dfe2f1]">
                Document AI
              </span>
            </Link>

            <p className="text-xs text-[#8c909f] max-w-sm leading-relaxed">
              Enterprise Document Intelligence, Grounded RAG, Knowledge Graphs, and Collaborative Workspace Capabilities.
            </p>

            <div className="text-[11px] font-mono text-[#8c909f]">
              © 2026 Document AI Enterprise. All rights reserved.
            </div>
          </div>

          {/* Product Col */}
          <div className="space-y-3">
            <div className="font-mono font-bold text-[#dfe2f1] uppercase tracking-wider text-[11px]">
              PRODUCT
            </div>
            <ul className="space-y-2">
              <li>
                <Link href="/documents" className="hover:text-[#adc6ff] transition">
                  Document Processing
                </Link>
              </li>
              <li>
                <Link href="/chat" className="hover:text-[#adc6ff] transition">
                  RAG Chat
                </Link>
              </li>
              <li>
                <Link href="/knowledge-bases" className="hover:text-[#adc6ff] transition">
                  Knowledge Bases
                </Link>
              </li>
              <li>
                <Link href="/knowledge-graph" className="hover:text-[#adc6ff] transition">
                  Knowledge Graph
                </Link>
              </li>
            </ul>
          </div>

          {/* Experience Col */}
          <div className="space-y-3">
            <div className="font-mono font-bold text-[#dfe2f1] uppercase tracking-wider text-[11px]">
              AI EXPERIENCES
            </div>
            <ul className="space-y-2">
              <li>
                <Link href="/study/voice-tutor" className="hover:text-[#adc6ff] transition">
                  AI Voice Tutor
                </Link>
              </li>
              <li>
                <Link href="/study/chill-focus" className="hover:text-[#adc6ff] transition">
                  Chill & Focus Mode
                </Link>
              </li>
              <li>
                <Link href="/study" className="hover:text-[#adc6ff] transition">
                  AI Study Mode
                </Link>
              </li>
              <li>
                <Link href="/collab-chat" className="hover:text-[#adc6ff] transition">
                  Collab Chat
                </Link>
              </li>
            </ul>
          </div>

          {/* Legal / Status Col */}
          <div className="space-y-3">
            <div className="font-mono font-bold text-[#dfe2f1] uppercase tracking-wider text-[11px]">
              RESOURCES & LEGAL
            </div>
            <ul className="space-y-2">
              <li>
                <Link href="/terms-and-conditions" className="hover:text-[#adc6ff] transition">
                  Terms & Conditions
                </Link>
              </li>
              <li>
                <Link href="/contact-us" className="hover:text-[#adc6ff] transition">
                  Contact Support
                </Link>
              </li>
              <li>
                <Link href="/health" className="hover:text-[#adc6ff] transition">
                  System Health
                </Link>
              </li>
              <li>
                <Link href="/login" className="hover:text-[#adc6ff] transition">
                  Account Sign In
                </Link>
              </li>
              <li>
                <Link href="/register" className="hover:text-[#adc6ff] transition">
                  Register
                </Link>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </footer>
  );
};
