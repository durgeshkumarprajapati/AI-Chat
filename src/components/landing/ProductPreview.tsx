'use client';

import React, { useState } from 'react';

export const ProductPreview: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'copilot' | 'citation'>('copilot');

  return (
    <section className="py-24 bg-[#0f131d] relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
        {/* Section Header */}
        <div className="text-center space-y-3 max-w-3xl mx-auto">
          <div className="text-xs font-mono font-bold uppercase tracking-widest text-[#4edea3]">
            INTERACTIVE WORKSPACE DEMONSTRATION
          </div>
          <h2 className="text-3xl sm:text-5xl font-extrabold text-[#dfe2f1]">
            Experience Document AI Workspace
          </h2>
          <p className="text-base sm:text-lg text-[#c2c6d6]">
            Inspect how grounded multi-turn dialogues cite exact document passages with complete evidence verification.
          </p>
        </div>

        {/* Mock Product Window Container */}
        <div className="bg-[#0a0e18] border border-[#424754] rounded-3xl shadow-2xl overflow-hidden">
          {/* Top Window Bar */}
          <div className="bg-[#0f131d] border-b border-[#424754] px-6 py-3 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <span className="w-3 h-3 rounded-full bg-rose-500/80" />
              <span className="w-3 h-3 rounded-full bg-amber-500/80" />
              <span className="w-3 h-3 rounded-full bg-emerald-500/80" />
              <span className="text-xs font-mono text-[#8c909f] ml-2">
                workspace.documentai.enterprise
              </span>
            </div>

            <div className="flex items-center space-x-3 text-xs font-mono text-[#adc6ff]">
              <span className="px-2.5 py-0.5 rounded bg-[#4d8eff]/20 border border-[#4d8eff]/40">
                Grounded Mode: ON
              </span>
            </div>
          </div>

          {/* Main 3-Column Mock Workspace */}
          <div className="grid grid-cols-1 lg:grid-cols-12 min-h-[480px]">
            {/* Column 1: Document Tree Navigation (2 cols) */}
            <div className="lg:col-span-3 border-r border-[#424754]/60 p-4 space-y-4 bg-[#0f131d]/50 hidden lg:block">
              <div className="text-[10px] font-mono font-bold text-[#8c909f] uppercase tracking-wider">
                PROJECT DOCUMENTS (4)
              </div>
              <div className="space-y-2 text-xs font-mono">
                <div className="p-2.5 rounded-xl bg-[#4d8eff]/20 border border-[#4d8eff]/50 text-[#dfe2f1] font-semibold flex items-center justify-between">
                  <span className="truncate">📄 Master_Service_Agreement_2026.pdf</span>
                  <span className="text-[#4edea3]">✓</span>
                </div>
                <div className="p-2.5 rounded-xl bg-[#0a0e18] hover:bg-[#0f131d] border border-[#424754]/40 text-[#c2c6d6] flex items-center justify-between">
                  <span className="truncate">📊 Q3_Financial_Audit.pdf</span>
                  <span className="text-[#8c909f]">✓</span>
                </div>
                <div className="p-2.5 rounded-xl bg-[#0a0e18] hover:bg-[#0f131d] border border-[#424754]/40 text-[#c2c6d6] flex items-center justify-between">
                  <span className="truncate">📄 Security_Policy_v4.pdf</span>
                  <span className="text-[#8c909f]">✓</span>
                </div>
              </div>
            </div>

            {/* Column 2: Document Viewer (5 cols) */}
            <div className="lg:col-span-5 p-6 border-r border-[#424754]/60 space-y-4 bg-[#0a0e18] flex flex-col justify-between">
              <div className="space-y-3">
                <div className="flex justify-between items-center text-xs font-mono text-[#8c909f]">
                  <span>Viewing Page 12 of 24</span>
                  <span className="text-[#4edea3]">OCR Confidence: 99.8%</span>
                </div>

                <div className="p-4 rounded-2xl bg-[#0f131d] border border-[#424754]/80 space-y-3 text-xs text-[#c2c6d6] leading-relaxed">
                  <p>
                    <strong className="text-[#dfe2f1]">Section 4.1 — Service Scope:</strong> Provider agrees to deliver enterprise document intelligence capabilities subject to SLA guidelines.
                  </p>
                  <p className="bg-[#ffb95f]/15 border-l-2 border-[#ffb95f] p-2 text-[#dfe2f1] font-semibold">
                    <strong className="text-[#ffb95f]">Section 4.2 — Payment Terms:</strong> Invoices shall be rendered monthly. Payment is due within 30 calendar days of invoice date (Net 30). Late payments accrue a 1.5% monthly fee.
                  </p>
                  <p>
                    <strong className="text-[#dfe2f1]">Section 4.3 — Confidentiality:</strong> All document data processed remains strictly encrypted in transit and at rest.
                  </p>
                </div>
              </div>

              <div className="text-[11px] font-mono text-[#4d8eff] flex items-center space-x-1">
                <span>🔍 Highlighted via RAG Grounding Verification</span>
              </div>
            </div>

            {/* Column 3: AI Copilot & Citation Panel (4 cols) */}
            <div className="lg:col-span-4 p-6 space-y-4 bg-[#0f131d] flex flex-col justify-between">
              <div className="space-y-4">
                {/* Panel Tabs */}
                <div className="flex border-b border-[#424754] pb-2 text-xs font-mono">
                  <button
                    onClick={() => setActiveTab('copilot')}
                    className={`mr-4 font-bold pb-1 transition-colors ${
                      activeTab === 'copilot' ? 'text-[#adc6ff] border-b-2 border-[#4d8eff]' : 'text-[#8c909f]'
                    }`}
                  >
                    AI Copilot Dialogue
                  </button>
                  <button
                    onClick={() => setActiveTab('citation')}
                    className={`font-bold pb-1 transition-colors ${
                      activeTab === 'citation' ? 'text-[#adc6ff] border-b-2 border-[#4d8eff]' : 'text-[#8c909f]'
                    }`}
                  >
                    Citation Evidence
                  </button>
                </div>

                {/* User Prompt */}
                <div className="bg-[#0a0e18] p-3 rounded-xl border border-[#424754] text-xs text-[#dfe2f1]">
                  <span className="font-mono text-[#adc6ff] font-bold block mb-1">USER:</span>
                  What are the key payment terms in the Master Service Agreement?
                </div>

                {/* AI Grounded Response */}
                <div className="bg-[#4d8eff]/10 p-4 rounded-xl border border-[#4d8eff]/40 text-xs text-[#dfe2f1] space-y-2">
                  <span className="font-mono text-[#4edea3] font-bold block">AI COPILOT:</span>
                  <p className="leading-relaxed">
                    According to <strong className="text-[#adc6ff]">Section 4.2</strong> (Page 12), invoices are rendered monthly and payment is due within <strong className="text-[#4edea3]">30 days (Net 30)</strong>. Late payments accrue a 1.5% monthly interest fee.
                  </p>

                  <div className="pt-2 border-t border-[#424754]/40 flex items-center justify-between text-[10px] font-mono">
                    <span className="text-[#ffb95f]">📌 Source: Page 12, Sec 4.2</span>
                    <span className="text-[#4edea3] font-bold">Confidence: 98%</span>
                  </div>
                </div>
              </div>

              <div className="text-[10px] font-mono text-[#8c909f] text-center border-t border-[#424754]/40 pt-3">
                Live Interactive Workspace Demo Presentation
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
