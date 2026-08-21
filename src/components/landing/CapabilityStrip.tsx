'use client';

import React from 'react';

export const CapabilityStrip: React.FC = () => {
  const capabilities = [
    'DOCUMENT INTELLIGENCE',
    'RAG CONVERSATIONS',
    'KNOWLEDGE GRAPH',
    'AI COPILOT',
    'AGENTIC RESEARCH',
    'VOICE AI TUTOR',
    'CHILL & FOCUS MODE',
    'COLLAB CHAT & MEET',
    'AUTOMATED WORKFLOWS',
    'AI MOCK TESTS'
  ];

  return (
    <section className="py-6 bg-[#0a0e18] border-y border-[#424754]/50 overflow-hidden font-mono">
      <div className="flex items-center space-x-8 animate-marquee whitespace-nowrap hover:[animation-play-state:paused]">
        {[...capabilities, ...capabilities].map((item, idx) => (
          <div key={idx} className="flex items-center space-x-6">
            <span className="text-xs font-bold text-[#c2c6d6] tracking-widest uppercase hover:text-[#4d8eff] transition-colors">
              {item}
            </span>
            <span className="text-[#4edea3] text-xs">◆</span>
          </div>
        ))}
      </div>
    </section>
  );
};
