'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useWorkspace } from '@/context/WorkspaceContext';
import { AuthLayoutShell } from '@/components/auth/AuthLayoutShell';
import { AuthBrandHeader } from '@/components/auth/AuthBrandHeader';
import { AuthCard } from '@/components/auth/AuthCard';

export default function RegisterPage() {
  const router = useRouter();
  const { authStatus, refreshUser } = useWorkspace();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (authStatus === 'AUTHENTICATED') {
      router.replace('/dashboard');
    }
  }, [authStatus, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || 'Registration failed.');
      }

      await refreshUser();
      router.push('/dashboard');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to register account.');
    } finally {
      setLoading(false);
    }
  };

  if (authStatus === 'AUTHENTICATED') {
    return (
      <AuthLayoutShell>
        <AuthCard>
          <div className="flex flex-col items-center justify-center py-12 space-y-3 font-sans">
            <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            <p className="text-xs text-primary font-mono animate-pulse">
              Redirecting to Dashboard...
            </p>
          </div>
        </AuthCard>
      </AuthLayoutShell>
    );
  }

  return (
    <AuthLayoutShell>
      <AuthBrandHeader
        title="Document AI"
        subtitle="Create your account"
      />

      <AuthCard>
        {error && (
          <div className="p-3.5 rounded-xl bg-rose-950/80 border border-rose-800 text-xs font-semibold text-rose-300">
            ⚠️ {error}
          </div>
        )}

        <form className="space-y-4 font-sans" onSubmit={handleSubmit}>
          <div className="space-y-1.5">
            <label className="block text-[10px] font-mono font-bold text-primary uppercase tracking-wider">
              Full Name
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">👤</span>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full h-12 pl-10 pr-4 bg-surface border border-border rounded-xl text-xs text-foreground placeholder-text-disabled focus:outline-none focus:border-primary shadow-inner transition"
                placeholder="John Doe"
              />
            </div>
          </div>

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

          <div className="space-y-1.5">
            <label className="block text-[10px] font-mono font-bold text-primary uppercase tracking-wider">
              Password
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">🔒</span>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full h-12 pl-10 pr-4 bg-surface border border-border rounded-xl text-xs text-foreground placeholder-text-disabled focus:outline-none focus:border-primary shadow-inner transition"
                placeholder="At least 8 characters"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-[10px] font-mono font-bold text-primary uppercase tracking-wider">
              Confirm Password
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">🔒</span>
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full h-12 pl-10 pr-4 bg-surface border border-border rounded-xl text-xs text-foreground placeholder-text-disabled focus:outline-none focus:border-primary shadow-inner transition"
                placeholder="Repeat password"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full h-12 mt-2 bg-gradient-to-r from-primary via-primary to-primary-hover hover:opacity-95 disabled:opacity-50 text-primary-foreground font-extrabold text-xs rounded-xl shadow-lg shadow-primary/20 transition flex items-center justify-center space-x-2"
          >
            <span>{loading ? 'Creating Account...' : 'Create Account'}</span>
            <span>→</span>
          </button>
        </form>

        <div className="pt-2 text-center text-xs text-muted-foreground font-sans">
          Already have an account?{' '}
          <Link href="/login" className="text-primary hover:text-primary font-bold transition">
            Sign in
          </Link>
        </div>
      </AuthCard>
    </AuthLayoutShell>
  );
}
