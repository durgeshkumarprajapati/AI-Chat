'use client';

import React from 'react';
import Link from 'next/link';

export const PlatformBento: React.FC = () => {
  return (
    <section id="features" className="py-24 bg-[#0f131d] relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-16">
        {/* Header */}
        <div className="text-center space-y-4 max-w-3xl mx-auto">
          <div className="text-xs font-mono font-bold uppercase tracking-widest text-[#4edea3]">
            BUILT FOR COMPLEXITY
          </div>
          <h2 className="text-3xl sm:text-5xl font-extrabold text-[#dfe2f1] font-sans tracking-tight">
            Architected for Enterprise Intelligence
          </h2>
          <p className="text-base sm:text-lg text-[#c2c6d6]">
            Seamlessly transition from raw document ingestion to grounded, high-fidelity conversational knowledge retrieval.
          </p>
        </div>

        {/* Bento Grid Layout */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
          {/* Card 1: Automated PDF Processing (Medium/Large) */}
          <div className="md:col-span-6 bg-[#0a0e18]/90 border border-[#424754] hover:border-[#4d8eff]/60 rounded-3xl p-8 space-y-6 transition-all duration-300 hover:shadow-2xl hover:shadow-[#4d8eff]/10 group relative overflow-hidden flex flex-col justify-between">
            <div className="space-y-4 z-10">
              <div className="w-12 h-12 rounded-2xl bg-[#4d8eff]/20 border border-[#4d8eff]/40 flex items-center justify-center text-2xl text-[#adc6ff]">
                📄
              </div>
              <h3 className="text-2xl font-bold text-[#dfe2f1] group-hover:text-[#adc6ff] transition-colors">
                Automated PDF Processing & OCR
              </h3>
              <p className="text-sm text-[#c2c6d6] leading-relaxed">
                Neural OCR engine extracts text, tables, headers, and hierarchical structures from complex scanned documents, standardizing unstructured data automatically.
              </p>
            </div>

            {/* Code / Metadata Preview Graphic */}
            <div className="bg-[#0f131d] border border-[#424754]/60 rounded-2xl p-4 font-mono text-xs text-[#adc6ff] space-y-1 mt-4">
              <div className="text-[10px] text-[#8c909f] font-bold">EXTRACTED STRUCTURAL METADATA</div>
              <div className="text-[#4edea3]">{`{ "pages": 24, "tables": 8, "ocrConfidence": "99.4%" }`}</div>
            </div>
          </div>

          {/* Card 2: Multi-turn RAG Conversations */}
          <div className="md:col-span-6 bg-[#0a0e18]/90 border border-[#424754] hover:border-[#4d8eff]/60 rounded-3xl p-8 space-y-6 transition-all duration-300 hover:shadow-2xl hover:shadow-[#4d8eff]/10 group relative overflow-hidden flex flex-col justify-between">
            <div className="space-y-4 z-10">
              <div className="w-12 h-12 rounded-2xl bg-[#4edea3]/20 border border-[#4edea3]/40 flex items-center justify-center text-2xl text-[#4edea3]">
                💬
              </div>
              <h3 className="text-2xl font-bold text-[#dfe2f1] group-hover:text-[#4edea3] transition-colors">
                Multi-turn RAG Conversations
              </h3>
              <p className="text-sm text-[#c2c6d6] leading-relaxed">
                Engage in contextual, multi-turn dialogues with enterprise knowledge. Every response includes direct source evidence and exact page citations.
              </p>
            </div>

            <div className="bg-[#0f131d] border border-[#424754]/60 rounded-2xl p-4 space-y-2 mt-4">
              <div className="flex items-center space-x-2 text-xs font-mono text-[#4edea3]">
                <span>📌 Page 14 • Section 3.1</span>
                <span className="text-[#8c909f]">|</span>
                <span>Grounding Score: 98%</span>
              </div>
              <p className="text-xs text-[#c2c6d6] italic">
                &quot;Late payment penalty rate is 1.5% per month starting 30 days past invoice date.&quot;
              </p>
            </div>
          </div>

          {/* Card 3: Vector Knowledge Bases & Knowledge Graph (Full Width) */}
          <div className="md:col-span-12 bg-gradient-to-r from-[#0a0e18] via-[#0f131d] to-[#0a0e18] border border-[#424754] hover:border-[#4d8eff]/60 rounded-3xl p-8 sm:p-10 space-y-6 transition-all duration-300 hover:shadow-2xl hover:shadow-[#4d8eff]/10 relative overflow-hidden">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
              <div className="lg:col-span-7 space-y-4">
                <div className="w-12 h-12 rounded-2xl bg-[#ffb95f]/20 border border-[#ffb95f]/40 flex items-center justify-center text-2xl text-[#ffb95f]">
                  🕸️
                </div>
                <h3 className="text-3xl font-bold text-[#dfe2f1]">
                  Hybrid Vector Store & Knowledge Graph
                </h3>
                <p className="text-sm sm:text-base text-[#c2c6d6] leading-relaxed">
                  Combine high-density pgvector semantic embeddings with graph entity relationships. Map people, contracts, projects, and entities across your entire organization for zero-hallucination answers.
                </p>
                <div className="pt-2">
                  <Link
                    href="/knowledge-bases"
                    className="inline-flex items-center space-x-2 text-xs font-mono font-bold text-[#4d8eff] hover:text-[#adc6ff] transition-colors"
                  >
                    <span>Explore Knowledge Bases</span>
                    <span>→</span>
                  </Link>
                </div>
              </div>

              {/* Simulated Knowledge Graph Node Preview */}
              <div className="lg:col-span-5 bg-[#0f131d] border border-[#424754]/80 rounded-2xl p-6 relative overflow-hidden font-mono text-xs text-[#c2c6d6]">
                <div className="text-[10px] text-[#8c909f] uppercase font-bold mb-3">
                  GRAPH RELATIONSHIP MATRIX
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between items-center bg-[#0a0e18] p-2 rounded border border-[#424754]/40">
                    <span className="text-[#adc6ff]">Vendor Agreement</span>
                    <span className="text-[#4edea3]">→ governs →</span>
                    <span className="text-[#ffb95f]">Payment Terms</span>
                  </div>
                  <div className="flex justify-between items-center bg-[#0a0e18] p-2 rounded border border-[#424754]/40">
                    <span className="text-[#adc6ff]">Project Alpha</span>
                    <span className="text-[#4edea3]">→ references →</span>
                    <span className="text-[#ffb95f]">Audit Report</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Card 4: AI Copilot & Autonomous Agents */}
          <div className="md:col-span-6 bg-[#0a0e18]/90 border border-[#424754] hover:border-[#4d8eff]/60 rounded-3xl p-8 space-y-4 transition-all duration-300">
            <div className="w-12 h-12 rounded-2xl bg-[#4d8eff]/20 border border-[#4d8eff]/40 flex items-center justify-center text-2xl">
              🧠
            </div>
            <h3 className="text-xl font-bold text-[#dfe2f1]">AI Copilot & Memory</h3>
            <p className="text-sm text-[#c2c6d6] leading-relaxed">
              Turn enterprise data into actionable intelligence with long-term copilot memory, task automation, and intelligent context synthesis.
            </p>
          </div>

          {/* Card 5: Agentic Research & Workflows */}
          <div className="md:col-span-6 bg-[#0a0e18]/90 border border-[#424754] hover:border-[#4d8eff]/60 rounded-3xl p-8 space-y-4 transition-all duration-300">
            <div className="w-12 h-12 rounded-2xl bg-[#4edea3]/20 border border-[#4edea3]/40 flex items-center justify-center text-2xl">
              🔬
            </div>
            <h3 className="text-xl font-bold text-[#dfe2f1]">Agentic Research & Workflows</h3>
            <p className="text-sm text-[#c2c6d6] leading-relaxed">
              Let autonomous AI agents investigate multi-document questions, execute multi-step research plans, and trigger automated workflows.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};
