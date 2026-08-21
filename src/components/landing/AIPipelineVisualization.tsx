'use client';

import React, { useEffect, useRef, useState } from 'react';

export const AIPipelineVisualization: React.FC = () => {
  const [isVisible, setIsVisible] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const sectionRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // Check reduced motion preference
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(motionQuery.matches);

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry) setIsVisible(entry.isIntersecting);
      },
      { threshold: 0.15 }
    );

    if (sectionRef.current) {
      observer.observe(sectionRef.current);
    }

    return () => observer.disconnect();
  }, []);

  const steps = [
    { label: 'DOCUMENT', icon: '📄', desc: 'PDF / Image Ingestion' },
    { label: 'OCR', icon: '👁️', desc: 'Neural Text Extraction' },
    { label: 'STRUCTURE', icon: '📐', desc: 'Layout & Hierarchy' },
    { label: 'CHUNKING', icon: '🧩', desc: 'Semantic Splitting' },
    { label: 'EMBEDDINGS', icon: '⚡', desc: 'Vectorization' },
    { label: 'VECTOR STORE', icon: '🗄️', desc: 'pgvector Index' },
    { label: 'KNOWLEDGE GRAPH', icon: '🕸️', desc: 'Entity Extraction' },
    { label: 'RAG ENGINE', icon: '🔍', desc: 'Hybrid Search' },
    { label: 'AI ANSWER', icon: '💡', desc: 'Grounded Output' }
  ];

  return (
    <section id="pipeline" ref={sectionRef} className="py-20 bg-[#0f131d] relative overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
        {/* Section Header */}
        <div className="text-center space-y-3 max-w-3xl mx-auto">
          <div className="text-xs font-mono font-bold uppercase tracking-widest text-[#4d8eff]">
            END-TO-END PIPELINE ARCHITECTURE
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-[#dfe2f1]">
            How Document AI Process Data
          </h2>
          <p className="text-sm sm:text-base text-[#c2c6d6]">
            From raw, unstructured files to grounded, zero-hallucination conversational responses.
          </p>
        </div>

        {/* Pipeline Nodes Flow */}
        <div className="relative bg-[#0a0e18]/90 border border-[#424754] rounded-3xl p-6 sm:p-10 shadow-2xl overflow-x-auto">
          <div className="min-w-[900px] flex items-center justify-between relative py-6">
            {/* Animated Background Connector Beam */}
            <div className="absolute left-6 right-6 top-1/2 -translate-y-1/2 h-1 bg-[#424754]/60 z-0">
              {isVisible && !reducedMotion && (
                <div className="h-full bg-gradient-to-r from-[#4d8eff] via-[#4edea3] to-[#ffb95f] w-1/3 animate-pulse transition-all duration-1000" />
              )}
            </div>

            {/* Pipeline Step Cards */}
            {steps.map((step, idx) => (
              <div
                key={step.label}
                className="relative z-10 flex flex-col items-center group cursor-pointer"
              >
                <div
                  className={`w-14 h-14 rounded-2xl border transition-all duration-500 flex items-center justify-center text-xl shadow-lg ${
                    idx === 8
                      ? 'bg-gradient-to-br from-[#4d8eff] to-[#4edea3] border-[#4edea3] text-[#0a0e18] font-bold scale-110 shadow-[#4edea3]/30'
                      : 'bg-[#0f131d] hover:bg-[#141926] border-[#424754] hover:border-[#4d8eff] text-[#dfe2f1]'
                  }`}
                >
                  {step.icon}
                </div>

                <div className="mt-3 text-center space-y-0.5">
                  <div className="text-[11px] font-mono font-bold text-[#dfe2f1] tracking-wider uppercase">
                    {step.label}
                  </div>
                  <div className="text-[9px] font-mono text-[#8c909f] max-w-[90px] truncate">
                    {step.desc}
                  </div>
                </div>

                {/* Animated Particle Indicator */}
                {isVisible && !reducedMotion && (
                  <span className="w-2 h-2 rounded-full bg-[#4edea3] absolute -top-2 animate-ping" />
                )}
              </div>
            ))}
          </div>

          <div className="mt-6 pt-4 border-t border-[#424754]/40 flex items-center justify-between text-xs font-mono text-[#8c909f]">
            <div className="flex items-center space-x-2">
              <span className="w-2 h-2 rounded-full bg-[#4edea3]" />
              <span>Real-time Ingestion & Retrieval Pipeline</span>
            </div>
            <div>Deterministic Grounding & Audit Trail</div>
          </div>
        </div>
      </div>
    </section>
  );
};
