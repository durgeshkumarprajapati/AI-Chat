'use client';

import React from 'react';
import Link from 'next/link';

export const HeroSection: React.FC = () => {
  return (
    <section className="relative pt-32 pb-20 md:pt-40 md:pb-28 overflow-hidden bg-gradient-to-b from-[#0a0e18] via-[#0f131d] to-[#0f131d]">
      {/* Glow Effects */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[350px] bg-[#4d8eff]/15 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute top-1/3 right-10 w-[300px] h-[300px] bg-[#4edea3]/10 blur-[100px] rounded-full pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          {/* Left Column: Headline & Messaging */}
          <div className="lg:col-span-7 space-y-6 text-left">
            {/* Enterprise Badge */}
            <div className="inline-flex items-center space-x-2 px-3.5 py-1.5 rounded-full bg-[#0a0e18]/80 border border-[#4d8eff]/30 text-[#adc6ff] text-xs font-mono font-semibold shadow-inner">
              <span className="w-2 h-2 rounded-full bg-[#4edea3] animate-ping" />
              <span>✨ V2.0 ENTERPRISE RELEASE</span>
            </div>

            {/* Main Headline */}
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-[#dfe2f1] tracking-tight leading-[1.1] font-sans">
              Your Enterprise Data,{' '}
              <span className="bg-gradient-to-r from-[#adc6ff] via-[#4d8eff] to-[#4edea3] bg-clip-text text-transparent">
                Intelligent & Actionable
              </span>
            </h1>

            {/* Subhead / Supporting Language */}
            <p className="text-base sm:text-lg text-[#c2c6d6] leading-relaxed max-w-2xl">
              Unlock the power of your unstructured documents with state-of-the-art OCR, Knowledge Graphs, and grounded RAG pipelines. Transform static PDFs into conversational intelligence instantly.
            </p>

            {/* Action Buttons */}
            <div className="pt-4 flex flex-wrap items-center gap-4">
              <Link
                href="/register"
                className="px-6 py-3.5 rounded-xl bg-gradient-to-r from-[#4d8eff] via-[#4d8eff] to-[#adc6ff] text-[#0a0e18] font-bold text-sm shadow-xl shadow-[#4d8eff]/30 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center space-x-2"
              >
                <span>Start Free Trial</span>
                <span>→</span>
              </Link>

              <Link
                href="/dashboard"
                className="px-6 py-3.5 rounded-xl bg-[#0a0e18]/90 hover:bg-[#0a0e18] border border-[#424754] text-[#dfe2f1] hover:border-[#8c909f] font-bold text-sm shadow-lg transition-all flex items-center space-x-2"
              >
                <span>Explore Platform</span>
              </Link>

              <Link
                href="/documents"
                className="text-xs font-mono text-[#adc6ff] hover:underline px-2 py-3 flex items-center space-x-1"
              >
                <span>View Documentation</span>
                <span>↗</span>
              </Link>
            </div>

            {/* Micro Feature Bullet Highlights */}
            <div className="pt-6 grid grid-cols-3 gap-4 border-t border-[#424754]/40 text-xs text-[#c2c6d6] font-mono">
              <div className="flex items-center space-x-2">
                <span className="text-[#4edea3]">✓</span>
                <span>Zero Hallucination</span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-[#4edea3]">✓</span>
                <span>Multi-turn RAG</span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-[#4edea3]">✓</span>
                <span>Knowledge Graph</span>
              </div>
            </div>
          </div>

          {/* Right Column: Hero Visual Graphic Panel */}
          <div className="lg:col-span-5">
            <div className="relative rounded-3xl p-1 bg-gradient-to-b from-[#4d8eff]/40 via-[#424754]/30 to-transparent shadow-2xl shadow-[#4d8eff]/10">
              <div className="bg-[#0a0e18] border border-[#424754] rounded-[22px] p-6 space-y-4 relative overflow-hidden">
                {/* Status Pill Header */}
                <div className="flex items-center justify-between border-b border-[#424754]/50 pb-4">
                  <div className="flex items-center space-x-2">
                    <div className="w-3 h-3 rounded-full bg-[#4edea3]" />
                    <span className="text-xs font-mono font-bold text-[#dfe2f1]">
                      DOCUMENT AI CORE ENGINE
                    </span>
                  </div>

                  <div className="px-3 py-1 rounded-full bg-[#0f131d] border border-[#4edea3]/40 text-[11px] font-mono text-[#4edea3] font-bold flex items-center space-x-1.5 shadow-sm">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#4edea3] animate-pulse" />
                    <span>OCR STATUS: 10,492 Docs Parsed</span>
                  </div>
                </div>

                {/* Simulated Neural Data Ingestion Graphics */}
                <div className="h-56 rounded-xl bg-[#0f131d]/90 border border-[#424754]/60 p-4 relative flex flex-col justify-between overflow-hidden">
                  {/* Grid Lines Overlay */}
                  <div className="absolute inset-0 bg-[radial-gradient(#4d8eff_1px,transparent_1px)] [background-size:16px_16px] opacity-20 pointer-events-none" />

                  <div className="flex justify-between items-center z-10">
                    <div className="px-2.5 py-1 rounded bg-[#4d8eff]/20 border border-[#4d8eff]/40 text-[10px] font-mono text-[#adc6ff]">
                      INGESTION: ACTIVE
                    </div>
                    <div className="text-[10px] font-mono text-[#8c909f]">
                      LATENCY: 42ms
                    </div>
                  </div>

                  {/* Nodes Flow Animation */}
                  <div className="flex items-center justify-around my-auto z-10">
                    <div className="w-12 h-12 rounded-xl bg-[#4d8eff]/20 border border-[#4d8eff] flex items-center justify-center text-lg shadow-lg shadow-[#4d8eff]/30">
                      📄
                    </div>
                    <div className="h-0.5 w-12 bg-gradient-to-r from-[#4d8eff] to-[#4edea3] relative">
                      <div className="w-2 h-2 rounded-full bg-[#4edea3] absolute -top-0.75 animate-ping" />
                    </div>
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#4d8eff] to-[#00a572] flex items-center justify-center text-xl text-[#0a0e18] font-bold shadow-xl shadow-[#4edea3]/20">
                      🧠
                    </div>
                    <div className="h-0.5 w-12 bg-gradient-to-r from-[#4edea3] to-[#ffb95f] relative" />
                    <div className="w-12 h-12 rounded-xl bg-[#ffb95f]/20 border border-[#ffb95f] flex items-center justify-center text-lg shadow-lg shadow-[#ffb95f]/30">
                      🕸️
                    </div>
                  </div>

                  <div className="flex justify-between items-center z-10 text-[10px] font-mono text-[#c2c6d6]">
                    <span>Chunking & Vector Embeddings</span>
                    <span className="text-[#4edea3]">100% Verified Grounding</span>
                  </div>
                </div>

                <div className="text-[11px] text-[#8c909f] font-mono text-center">
                  Production-Grade RAG & Knowledge Graph Pipeline
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
