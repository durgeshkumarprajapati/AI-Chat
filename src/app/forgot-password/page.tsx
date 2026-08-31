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
        <p className="text-xs text-muted-foreground text-center font-sans">
          Enter your account email below to receive a password reset link.
        </p>

        {message && (
          <div className="p-3.5 rounded-xl bg-primary/15 border border-primary/40 text-xs font-semibold text-primary">
            ℹ️ {message}
          </div>
        )}

        <form className="space-y-4 font-sans" onSubmit={handleSubmit}>
          <div className="space-y-1.5">
            <label className="block text-[10px] font-mono font-bold text-primary uppercase tracking-wider">
              Email Address
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">✉</span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full h-12 pl-10 pr-4 bg-surface border border-border rounded-xl text-xs text-foreground placeholder-text-disabled focus:outline-none focus:border-primary shadow-inner transition"
                placeholder="you@example.com"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full h-12 mt-2 bg-gradient-to-r from-primary via-primary to-primary-hover hover:opacity-95 disabled:opacity-50 text-primary-foreground font-extrabold text-xs rounded-xl shadow-lg shadow-primary/20 transition flex items-center justify-center space-x-2"
          >
            <span>{loading ? 'Sending link...' : 'Send Reset Link'}</span>
          </button>
        </form>

        <div className="pt-2 text-center text-xs text-muted-foreground font-sans">
          <Link href="/login" className="text-primary hover:text-primary font-bold transition">
            ← Back to Sign In
          </Link>
        </div>
      </AuthCard>
    </AuthLayoutShell>
  );
}
