'use client';

import React, { useState } from 'react';
import Link from 'next/link';

export default function ContactUsPage() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    inquiryType: '',
    message: ''
  });

  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [ticketId, setTicketId] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    // Client-side validation check
    if (!formData.name.trim()) {
      setErrorMessage('Full Name is required.');
      return;
    }
    if (!formData.email.trim() || !formData.email.includes('@')) {
      setErrorMessage('Valid Enterprise Email is required.');
      return;
    }
    if (!formData.inquiryType) {
      setErrorMessage('Please select an inquiry type area of interest.');
      return;
    }
    if (!formData.message.trim() || formData.message.trim().length < 10) {
      setErrorMessage('Message detail must be at least 10 characters.');
      return;
    }

    try {
      setStatus('submitting');
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to submit contact request.');
      }

      setStatus('success');
      setTicketId(data.ticketId);
      setFormData({ name: '', email: '', inquiryType: '', message: '' });
    } catch (err: any) {
      console.error('[ContactForm] Error submitting form:', err);
      setStatus('error');
      setErrorMessage(err.message || 'An unexpected error occurred. Please try again.');
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-10 max-w-6xl mx-auto w-full space-y-8 font-sans selection:bg-[#4d8eff] selection:text-white">
        {/* Page Header */}
        <div className="space-y-2 text-left">
          <h1 className="text-3xl sm:text-4xl font-extrabold text-[#dfe2f1] tracking-tight">
            Contact <span className="bg-gradient-to-r from-[#adc6ff] to-[#4d8eff] bg-clip-text text-transparent">Support</span>
          </h1>
          <p className="text-xs sm:text-sm text-[#c2c6d6] max-w-2xl leading-relaxed">
            Need assistance with your enterprise deployments, custom RAG integrations, or general platform inquiries? Our dedicated engineering team is here to help.
          </p>
        </div>

        {/* Main Two-Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Column: Direct Channels & Offices */}
          <div className="lg:col-span-4 bg-[#0a0e18]/90 border border-[#424754] rounded-2xl p-6 space-y-6 shadow-2xl backdrop-blur-md">
            {/* Direct Channels */}
            <div className="space-y-4">
              <span className="text-[10px] font-mono font-bold text-[#c2c6d6] uppercase tracking-wider">
                Direct Channels
              </span>
              <div className="space-y-3 text-xs">
                <div className="p-3.5 rounded-xl bg-[#0f131d] border border-[#424754] flex items-start space-x-3">
                  <div className="p-2 rounded-lg bg-[#171b26] border border-[#424754] text-sm shrink-0">
                    ✉️
                  </div>
                  <div>
                    <span className="font-bold text-[#dfe2f1] block">Enterprise Support</span>
                    <a href="mailto:support@documentai.io" className="text-[#adc6ff] hover:underline font-mono text-[11px]">
                      support@documentai.io
                    </a>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-[#0f131d] border border-[#424754] flex items-start space-x-3">
                  <div className="p-2 rounded-lg bg-[#171b26] border border-[#424754] text-sm shrink-0">
                    📞
                  </div>
                  <div>
                    <span className="font-bold text-[#dfe2f1] block">Priority Hotline</span>
                    <span className="text-[#adc6ff] font-mono text-[11px]">+1 (800) 555-0199</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Global / Regional Offices */}
            <div className="space-y-4 pt-4 border-t border-[#424754]/50">
              <span className="text-[10px] font-mono font-bold text-[#c2c6d6] uppercase tracking-wider">
                Global Offices
              </span>
              <div className="space-y-4 text-xs">
                <div className="flex items-start space-x-3">
                  <span className="text-sm shrink-0 mt-0.5">📍</span>
                  <div>
                    <span className="font-bold text-[#dfe2f1] block">San Francisco, CA</span>
                    <span className="text-[#8c909f] text-[11px]">HQ & Core Engineering</span>
                  </div>
                </div>

                <div className="flex items-start space-x-3">
                  <span className="text-sm shrink-0 mt-0.5">📍</span>
                  <div>
                    <span className="font-bold text-[#dfe2f1] block">Singapore</span>
                    <span className="text-[#8c909f] text-[11px]">APAC Operations</span>
                  </div>
                </div>

                <div className="flex items-start space-x-3">
                  <span className="text-sm shrink-0 mt-0.5">📍</span>
                  <div>
                    <span className="font-bold text-[#dfe2f1] block">Vadodara, Gujarat</span>
                    <span className="text-[#8c909f] text-[11px]">AI Research Center</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Contact Form */}
          <div className="lg:col-span-8 bg-[#0a0e18]/90 border border-[#424754] rounded-2xl p-6 sm:p-8 space-y-6 shadow-2xl backdrop-blur-md">
            {status === 'success' ? (
              <div className="p-8 rounded-xl bg-[#0f131d] border border-[#4edea3]/40 text-center space-y-4">
                <div className="w-12 h-12 rounded-full bg-[#4edea3]/20 border border-[#4edea3]/40 flex items-center justify-center text-2xl mx-auto text-[#4edea3]">
                  ✓
                </div>
                <div className="space-y-1">
                  <h3 className="text-lg font-bold text-[#dfe2f1]">Message Sent Successfully!</h3>
                  <p className="text-xs text-[#c2c6d6]">
                    Our engineering support team has received your request and will respond within 24 hours.
                  </p>
                  <p className="text-[11px] font-mono text-[#adc6ff] pt-2">
                    Reference Ticket ID: <span className="font-bold">{ticketId}</span>
                  </p>
                </div>
                <button
                  onClick={() => setStatus('idle')}
                  className="px-5 py-2.5 bg-[#171b26] hover:bg-[#262a35] text-[#dfe2f1] rounded-xl text-xs font-bold border border-[#424754] transition"
                >
                  Send Another Inquiry
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5">
                {errorMessage && (
                  <div className="p-3.5 rounded-xl bg-[#ffb95f]/10 border border-[#ffb95f]/30 text-[#ffb95f] text-xs font-semibold flex items-center space-x-2">
                    <span>⚠️</span>
                    <span>{errorMessage}</span>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  {/* Full Name */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-mono font-bold text-[#c2c6d6] uppercase tracking-wider block">
                      Full Name
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        placeholder="Jane Doe"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        disabled={status === 'submitting'}
                        className="w-full bg-[#0f131d] border border-[#424754] rounded-xl px-3.5 py-2.5 pl-9 text-xs text-[#dfe2f1] placeholder-[#8c909f] focus:outline-none focus:border-[#4d8eff] focus:ring-1 focus:ring-[#4d8eff] transition"
                      />
                      <span className="absolute left-3 top-2.5 text-xs text-[#8c909f]">👤</span>
                    </div>
                  </div>

                  {/* Enterprise Email */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-mono font-bold text-[#c2c6d6] uppercase tracking-wider block">
                      Enterprise Email
                    </label>
                    <div className="relative">
                      <input
                        type="email"
                        placeholder="jane@company.com"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        disabled={status === 'submitting'}
                        className="w-full bg-[#0f131d] border border-[#424754] rounded-xl px-3.5 py-2.5 pl-9 text-xs text-[#dfe2f1] placeholder-[#8c909f] focus:outline-none focus:border-[#4d8eff] focus:ring-1 focus:ring-[#4d8eff] transition"
                      />
                      <span className="absolute left-3 top-2.5 text-xs text-[#8c909f]">✉️</span>
                    </div>
                  </div>
                </div>

                {/* Inquiry Type */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-mono font-bold text-[#c2c6d6] uppercase tracking-wider block">
                    Inquiry Type
                  </label>
                  <div className="relative">
                    <select
                      value={formData.inquiryType}
                      onChange={(e) => setFormData({ ...formData, inquiryType: e.target.value })}
                      disabled={status === 'submitting'}
                      className="w-full bg-[#0f131d] border border-[#424754] rounded-xl px-3.5 py-2.5 pl-9 text-xs text-[#dfe2f1] focus:outline-none focus:border-[#4d8eff] focus:ring-1 focus:ring-[#4d8eff] transition appearance-none cursor-pointer"
                    >
                      <option value="" disabled>
                        Select an area of interest...
                      </option>
                      <option value="enterprise_deployment">Enterprise Deployment & SLA</option>
                      <option value="rag_integration">Custom RAG & Knowledge Graph Integration</option>
                      <option value="api_billing">API Access & Billing Inquiries</option>
                      <option value="security_compliance">Security & Data Compliance</option>
                      <option value="general_support">General Technical Support</option>
                    </select>
                    <span className="absolute left-3 top-2.5 text-xs text-[#8c909f]">⚙️</span>
                    <span className="absolute right-3 top-2.5 text-xs text-[#8c909f] pointer-events-none">▼</span>
                  </div>
                </div>

                {/* Message Detail */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-mono font-bold text-[#c2c6d6] uppercase tracking-wider block">
                    Message Detail
                  </label>
                  <textarea
                    rows={5}
                    placeholder="Describe your issue, requirements, or desired outcomes..."
                    value={formData.message}
                    onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                    disabled={status === 'submitting'}
                    className="w-full bg-[#0f131d] border border-[#424754] rounded-xl p-3.5 text-xs text-[#dfe2f1] placeholder-[#8c909f] focus:outline-none focus:border-[#4d8eff] focus:ring-1 focus:ring-[#4d8eff] transition resize-none"
                  />
                </div>

                {/* Footer Disclaimer & Primary CTA */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2">
                  <p className="text-[11px] text-[#8c909f]">
                    By submitting, you agree to our{' '}
                    <Link href="/terms-and-conditions" className="text-[#adc6ff] hover:underline">
                      Terms & Privacy Policy
                    </Link>{' '}
                    regarding data handling.
                  </p>

                  <button
                    type="submit"
                    disabled={status === 'submitting'}
                    className="px-6 py-3 rounded-xl bg-gradient-to-r from-[#4d8eff] to-[#adc6ff] hover:opacity-95 text-[#0a0e18] font-extrabold text-xs shadow-lg shadow-[#4d8eff]/20 active:scale-[0.98] transition flex items-center justify-center space-x-2 shrink-0 disabled:opacity-50 cursor-pointer"
                  >
                    {status === 'submitting' ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-[#0a0e18]/30 border-t-[#0a0e18] rounded-full animate-spin" />
                        <span>Sending Message...</span>
                      </>
                    ) : (
                      <>
                        <span>Send Message</span>
                        <span>➢</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
  );
}
