'use client';

import React from 'react';

export const IntelligenceArchitecture: React.FC = () => {
  return (
    <section id="architecture" className="py-24 bg-[#0a0e18] relative overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-16">
        {/* Header */}
        <div className="text-center space-y-4 max-w-3xl mx-auto">
          <div className="text-xs font-mono font-bold uppercase tracking-widest text-[#4d8eff]">
            SYSTEM ARCHITECTURE
          </div>
          <h2 className="text-3xl sm:text-5xl font-extrabold text-[#dfe2f1]">
            Enterprise AI Intelligence Flow
          </h2>
          <p className="text-base sm:text-lg text-[#c2c6d6]">
            Conceptual data mapping showing how raw enterprise documents flow through vector indexing, knowledge graph relation mapping, and RAG synthesis to power copilot tools and workflows.
          </p>
        </div>

        {/* Conceptual Diagram Container */}
        <div className="bg-[#0f131d]/90 border border-[#424754] rounded-3xl p-8 sm:p-12 relative shadow-2xl space-y-12">
          {/* Layer 1: Ingestion */}
          <div className="text-center space-y-4">
            <div className="inline-block px-4 py-1.5 rounded-full bg-[#0a0e18] border border-[#424754] text-xs font-mono font-bold text-[#dfe2f1]">
              DOCUMENT INGESTION & OCR
            </div>
            <div className="flex justify-center items-center space-x-4">
              <span className="px-4 py-2 rounded-xl bg-[#0a0e18] border border-[#424754] text-xs font-mono text-[#c2c6d6]">
                PDF / Contracts
              </span>
              <span className="text-[#4d8eff]">↓</span>
              <span className="px-4 py-2 rounded-xl bg-[#0a0e18] border border-[#424754] text-xs font-mono text-[#c2c6d6]">
                Neural Layout Parser
              </span>
            </div>
          </div>

          <div className="w-0.5 h-8 bg-gradient-to-b from-[#4d8eff] to-[#4edea3] mx-auto" />

          {/* Layer 2: Dual Storage (Vector + Graph) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto">
            <div className="bg-[#0a0e18] border border-[#424754] hover:border-[#4d8eff] rounded-2xl p-6 text-center space-y-2 transition-all">
              <div className="text-xl">🗄️</div>
              <div className="text-sm font-bold text-[#dfe2f1] font-mono">VECTOR STORE (pgvector)</div>
              <div className="text-xs text-[#8c909f]">High-density semantic embedding indices</div>
            </div>

            <div className="bg-[#0a0e18] border border-[#424754] hover:border-[#ffb95f] rounded-2xl p-6 text-center space-y-2 transition-all">
              <div className="text-xl">🕸️</div>
              <div className="text-sm font-bold text-[#dfe2f1] font-mono">KNOWLEDGE GRAPH</div>
              <div className="text-xs text-[#8c909f]">Entity relationships & ontology mapping</div>
            </div>
          </div>

          <div className="w-0.5 h-8 bg-gradient-to-b from-[#4edea3] to-[#4d8eff] mx-auto" />

          {/* Layer 3: RAG Synthesis Engine */}
          <div className="max-w-xl mx-auto bg-gradient-to-r from-[#4d8eff]/20 via-[#4edea3]/20 to-[#4d8eff]/20 border border-[#4d8eff] rounded-2xl p-6 text-center space-y-2">
            <div className="text-xs font-mono font-bold text-[#4edea3] uppercase tracking-widest">
              HYBRID RAG & LLM GATEWAY ENGINE
            </div>
            <p className="text-xs text-[#c2c6d6]">
              Combines vector similarity search and graph context retrieval with circuit breaker fallback logic.
            </p>
          </div>

          <div className="w-0.5 h-8 bg-[#4d8eff] mx-auto" />

          {/* Layer 4: Application Intelligence Output */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 max-w-4xl mx-auto text-center font-mono text-xs">
            <div className="bg-[#0a0e18] p-4 rounded-xl border border-[#424754] text-[#adc6ff]">
              🧠 AI Copilot
            </div>
            <div className="bg-[#0a0e18] p-4 rounded-xl border border-[#424754] text-[#4edea3]">
              🔬 Agentic Research
            </div>
            <div className="bg-[#0a0e18] p-4 rounded-xl border border-[#424754] text-[#ffb95f]">
              🎤 AI Voice Tutor
            </div>
            <div className="bg-[#0a0e18] p-4 rounded-xl border border-[#424754] text-[#dfe2f1]">
              🧘 Chill & Focus
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
