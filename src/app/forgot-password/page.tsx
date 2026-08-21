'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { AuthLayoutShell } from '@/components/auth/AuthLayoutShell';
import { AuthBrandHeader } from '@/components/auth/AuthBrandHeader';
import { AuthCard } from '@/components/auth/AuthCard';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      const res = await fetch('/api/auth/password-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      const data = await res.json();
      setMessage(data.message || 'If an account exists for this email, a password reset link has been sent.');
    } catch {
      setMessage('If an account exists for this email, a password reset link has been sent.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayoutShell>
      <AuthBrandHeader
        title="Document AI"
        subtitle="Reset Your Password"
      />

      <AuthCard>
        <p className="text-xs text-[#8c909f] text-center font-sans">
          Enter your account email below to receive a password reset link.
        </p>

        {message && (
          <div className="p-3.5 rounded-xl bg-[#4d8eff]/15 border border-[#4d8eff]/40 text-xs font-semibold text-[#adc6ff]">
            ℹ️ {message}
          </div>
        )}

        <form className="space-y-4 font-sans" onSubmit={handleSubmit}>
          <div className="space-y-1.5">
            <label className="block text-[10px] font-mono font-bold text-[#adc6ff] uppercase tracking-wider">
              Email Address
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs text-[#8c909f]">✉</span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full h-12 pl-10 pr-4 bg-[#0f131d] border border-[#424754] rounded-xl text-xs text-[#dfe2f1] placeholder-[#8c909f] focus:outline-none focus:border-[#4d8eff] shadow-inner transition"
                placeholder="you@example.com"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full h-12 mt-2 bg-gradient-to-r from-[#4d8eff] via-[#4d8eff] to-[#adc6ff] hover:opacity-95 disabled:opacity-50 text-[#0a0e18] font-extrabold text-xs rounded-xl shadow-lg shadow-[#4d8eff]/20 transition flex items-center justify-center space-x-2"
          >
            <span>{loading ? 'Sending link...' : 'Send Reset Link'}</span>
          </button>
        </form>

        <div className="pt-2 text-center text-xs text-[#8c909f] font-sans">
          <Link href="/login" className="text-[#4d8eff] hover:text-[#adc6ff] font-bold transition">
            ← Back to Sign In
          </Link>
        </div>
      </AuthCard>
    </AuthLayoutShell>
  );
}
