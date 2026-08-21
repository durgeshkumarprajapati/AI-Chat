'use client';

import React from 'react';

export const EnterpriseSection: React.FC = () => {
  const items = [
    {
      title: 'Secure Authentication & RBAC',
      icon: '🔒',
      desc: 'Session security, role-aware user isolation, and Google OAuth integration.'
    },
    {
      title: 'Grounded AI Guardrails',
      icon: '🎯',
      desc: 'Strict evidence verification with page-level citation attribution.'
    },
    {
      title: 'Resilient LLM Fallback Architecture',
      icon: '⚡',
      desc: 'Automated provider failover with dynamic rate limiting and circuit breakers.'
    },
    {
      title: 'Async Worker Queue Architecture',
      icon: '⚙️',
      desc: 'Decoupled background worker processing for non-blocking document ingestion.'
    },
    {
      title: 'Structured Telemetry & Observability',
      icon: '📊',
      desc: 'Real-time event tracking and non-sensitive audit logging.'
    },
    {
      title: 'Production-Grade Integrations',
      icon: '🚀',
      desc: 'Native Google Calendar, Google Meet, and pgvector database integration.'
    }
  ];

  return (
    <section className="py-24 bg-[#0a0e18] relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-16">
        <div className="text-center space-y-4 max-w-3xl mx-auto">
          <div className="text-xs font-mono font-bold uppercase tracking-widest text-[#4d8eff]">
            ENTERPRISE RELIABILITY & SECURITY
          </div>
          <h2 className="text-3xl sm:text-5xl font-extrabold text-[#dfe2f1]">
            Engineered for Production Stability
          </h2>
          <p className="text-base sm:text-lg text-[#c2c6d6]">
            Built with robust architectural controls, tenant isolation, and resilient fallback systems.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {items.map((item) => (
            <div
              key={item.title}
              className="bg-[#0f131d] border border-[#424754] rounded-2xl p-6 space-y-3 shadow-lg hover:border-[#4d8eff]/50 transition-colors"
            >
              <div className="text-3xl">{item.icon}</div>
              <h3 className="text-lg font-bold text-[#dfe2f1]">{item.title}</h3>
              <p className="text-xs text-[#c2c6d6] leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
