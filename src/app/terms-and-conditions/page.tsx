'use client';

import React from 'react';
import Link from 'next/link';

export default function TermsAndConditionsPage() {
  return (
    <div className="p-4 sm:p-6 lg:p-10 max-w-4xl mx-auto w-full space-y-8 font-sans selection:bg-[#4d8eff] selection:text-white">
      {/* Page Header */}
      <div className="bg-[#0a0e18]/90 border border-[#424754]/60 rounded-2xl p-6 sm:p-8 space-y-4 shadow-2xl backdrop-blur-md relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-[#4d8eff]/10 blur-[100px] pointer-events-none rounded-full" />

        <div className="flex items-center space-x-2 text-[10px] font-mono font-bold text-[#adc6ff] uppercase tracking-widest">
          <span>LEGAL</span>
          <span className="text-[#8c909f]">•</span>
          <span>PLATFORM GOVERNANCE</span>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#424754]/60 pb-6 relative z-10">
          <div>
            <h1 className="text-3xl sm:text-4xl font-extrabold text-[#dfe2f1] tracking-tight">
              Terms and Conditions
            </h1>
            <p className="text-xs sm:text-sm text-[#c2c6d6] mt-2 leading-relaxed max-w-2xl">
              This legal agreement governs access to and use of the Document AI enterprise platform, RAG pipelines, Knowledge Graph services, and associated APIs.
            </p>
          </div>

          <div className="flex flex-col items-start sm:items-end space-y-2 shrink-0">
            <span className="text-[11px] font-mono text-[#8c909f] bg-[#0f131d] px-3 py-1.5 rounded-xl border border-[#424754]">
              Last Updated: August 15, 2026 • v2.4
            </span>
            <button
              onClick={() => {
                if (typeof window !== 'undefined') window.print();
              }}
              className="px-3.5 py-1.5 bg-[#171b26] hover:bg-[#262a35] text-[#adc6ff] border border-[#424754] rounded-xl text-xs font-bold transition flex items-center space-x-1.5 cursor-pointer"
            >
              <span>📄</span>
              <span>Download PDF</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Terms Content Body */}
      <div className="bg-[#0a0e18]/90 border border-[#424754] rounded-2xl p-6 sm:p-10 space-y-10 shadow-2xl backdrop-blur-md text-xs sm:text-sm text-[#c2c6d6] leading-relaxed">
        {/* 01 */}
        <section className="space-y-3 border-b border-[#424754]/40 pb-8">
          <div className="flex items-center space-x-2 text-[#4d8eff] font-mono font-bold text-sm">
            <span>01.</span>
            <h2 className="font-extrabold text-base sm:text-lg text-[#dfe2f1]">Agreement to Terms</h2>
          </div>
          <p>
            By accessing or utilizing the Document AI platform (&quot;Platform&quot;), associated web interfaces, REST APIs, or background retrieval infrastructure, you (&quot;Customer&quot;, &quot;User&quot;) agree to be bound strictly by these Terms and Conditions. If you are entering into this agreement on behalf of an enterprise entity, you represent that you possess authority to bind such entity.
          </p>
        </section>

        {/* 02 */}
        <section className="space-y-3 border-b border-[#424754]/40 pb-8">
          <div className="flex items-center space-x-2 text-[#4d8eff] font-mono font-bold text-sm">
            <span>02.</span>
            <h2 className="font-extrabold text-base sm:text-lg text-[#dfe2f1]">Intellectual Property & AI Models</h2>
          </div>
          <p>
            All proprietary OCR engines, hybrid vector indexing pipelines, Knowledge Graph resolution algorithms, and AI Copilot architectures hosted on the Platform remain the exclusive intellectual property of Document AI. Customer retains full ownership of uploaded document assets, text corpora, and extracted graph entities.
          </p>
          <div className="p-4 rounded-xl bg-[#0f131d] border border-[#424754] font-mono text-xs text-[#adc6ff] space-y-1">
            <span className="font-bold uppercase tracking-wider text-[#4edea3]">Data Isolation Guarantee</span>
            <p className="text-[#c2c6d6] font-sans">
              Customer document vectors, private memory states, and knowledge graphs are strictly isolated within dedicated tenant boundaries and are never utilized to train foundation public LLM models.
            </p>
          </div>
        </section>

        {/* 03 */}
        <section className="space-y-3 border-b border-[#424754]/40 pb-8">
          <div className="flex items-center space-x-2 text-[#4d8eff] font-mono font-bold text-sm">
            <span>03.</span>
            <h2 className="font-extrabold text-base sm:text-lg text-[#dfe2f1]">User Obligations & Conduct</h2>
          </div>
          <p>
            Users shall not engage in unauthorized API rate limit amplification, prompt injection attacks designed to exfiltrate cross-tenant embeddings, reverse engineering of proprietary OCR worker queues, or submitting malware-infected document payloads.
          </p>
        </section>

        {/* 04 */}
        <section className="space-y-3 border-b border-[#424754]/40 pb-8">
          <div className="flex items-center space-x-2 text-[#4d8eff] font-mono font-bold text-sm">
            <span>04.</span>
            <h2 className="font-extrabold text-base sm:text-lg text-[#dfe2f1]">Data Processing & Privacy</h2>
          </div>
          <p>
            Document AI processes unstructured document payloads strictly to perform optical character recognition, semantic chunking, vector embedding generation, and entity resolution. Data at rest is encrypted using AES-256 and in transit using TLS 1.3 encryption.
          </p>
        </section>

        {/* 05 */}
        <section className="space-y-3 border-b border-[#424754]/40 pb-8">
          <div className="flex items-center space-x-2 text-[#4d8eff] font-mono font-bold text-sm">
            <span>05.</span>
            <h2 className="font-extrabold text-base sm:text-lg text-[#dfe2f1]">Service Availability & SLA</h2>
          </div>
          <p>
            Document AI strives to maintain a 99.9% uptime target for API endpoints and background inference workers. Planned maintenance windows are communicated via System Health telemetries at least 48 hours prior to execution.
          </p>
        </section>

        {/* 06 */}
        <section className="space-y-3 border-b border-[#424754]/40 pb-8">
          <div className="flex items-center space-x-2 text-[#4d8eff] font-mono font-bold text-sm">
            <span>06.</span>
            <h2 className="font-extrabold text-base sm:text-lg text-[#dfe2f1]">Limitation of Liability</h2>
          </div>
          <p>
            To the maximum extent permitted by applicable law, Document AI shall not be liable for indirect, incidental, or consequential damages resulting from generative model outputs, automated citation summaries, or third-party provider downtime.
          </p>
        </section>

        {/* 07 */}
        <section className="space-y-3 border-b border-[#424754]/40 pb-8">
          <div className="flex items-center space-x-2 text-[#4d8eff] font-mono font-bold text-sm">
            <span>07.</span>
            <h2 className="font-extrabold text-base sm:text-lg text-[#dfe2f1]">Termination</h2>
          </div>
          <p>
            Customer may terminate enterprise subscription agreements at any time via Account & Workspace Settings. Upon termination, Customer document embeddings and knowledge graphs are permanently purged following a 30-day grace period.
          </p>
        </section>

        {/* 08 */}
        <section className="space-y-3 border-b border-[#424754]/40 pb-8">
          <div className="flex items-center space-x-2 text-[#4d8eff] font-mono font-bold text-sm">
            <span>08.</span>
            <h2 className="font-extrabold text-base sm:text-lg text-[#dfe2f1]">Governing Terms</h2>
          </div>
          <p>
            These Terms are governed by and construed in accordance with applicable commercial arbitration guidelines. Any legal proceedings shall be conducted exclusively within designated jurisdiction tribunals.
          </p>
        </section>

        {/* 09 */}
        <section className="space-y-3 border-b border-[#424754]/40 pb-8">
          <div className="flex items-center space-x-2 text-[#4d8eff] font-mono font-bold text-sm">
            <span>09.</span>
            <h2 className="font-extrabold text-base sm:text-lg text-[#dfe2f1]">Changes to Terms</h2>
          </div>
          <p>
            Document AI reserves the right to modify or update these Terms to reflect architectural enhancements or compliance requirements. Continued platform access constitutes acceptance of amended policies.
          </p>
        </section>

        {/* 10 */}
        <section className="space-y-3">
          <div className="flex items-center space-x-2 text-[#4d8eff] font-mono font-bold text-sm">
            <span>10.</span>
            <h2 className="font-extrabold text-base sm:text-lg text-[#dfe2f1]">Contact Information</h2>
          </div>
          <p>
            For legal inquiries, enterprise compliance questions, or data processing agreements, please reach out directly through our dedicated support portal.
          </p>
          <div className="pt-2">
            <Link
              href="/contact-us"
              className="inline-flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-[#4d8eff] to-[#adc6ff] text-[#0a0e18] rounded-xl text-xs font-extrabold shadow-lg shadow-[#4d8eff]/20 hover:opacity-95 transition"
            >
              <span>Contact Legal Support →</span>
            </Link>
          </div>
        </section>
      </div>

      {/* Legal Footer Navigation */}
      <div className="flex flex-wrap items-center justify-between gap-4 text-xs text-[#8c909f] font-mono border-t border-[#424754]/60 pt-6">
        <span>© 2026 Document AI Platform. All rights reserved.</span>
        <div className="flex items-center space-x-4">
          <Link href="/contact-us" className="hover:text-[#adc6ff] transition">
            Contact Us
          </Link>
          <Link href="/health" className="hover:text-[#adc6ff] transition">
            System Health
          </Link>
          <Link href="/dashboard" className="hover:text-[#adc6ff] transition">
            Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
