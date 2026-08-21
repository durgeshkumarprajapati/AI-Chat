'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useWorkspace } from '@/context/WorkspaceContext';
import { AuthLayoutShell } from '@/components/auth/AuthLayoutShell';
import { AuthBrandHeader } from '@/components/auth/AuthBrandHeader';
import { AuthCard } from '@/components/auth/AuthCard';

export default function LoginPage() {
  const router = useRouter();
  const { authStatus, refreshUser } = useWorkspace();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || 'Login failed.');
      }

      await refreshUser();
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleAuth = () => {
    window.location.href = '/api/auth/google';
  };

  if (authStatus === 'LOADING' || authStatus === 'AUTHENTICATED') {
    return (
      <AuthLayoutShell>
        <AuthCard>
          <div className="flex flex-col items-center justify-center py-12 space-y-3 font-sans">
            <div className="w-8 h-8 rounded-full border-2 border-[#4d8eff] border-t-transparent animate-spin" />
            <p className="text-xs text-[#adc6ff] font-mono animate-pulse">
              {authStatus === 'AUTHENTICATED' ? 'Redirecting to Dashboard...' : 'Verifying Session...'}
            </p>
          </div>
        </AuthCard>
      </AuthLayoutShell>
    );
  }

  return (
    <AuthLayoutShell>
      <AuthBrandHeader
        title="Document AI RAG"
        subtitle="Sign in to your AI workspace"
      />

      <AuthCard>
        {error && (
          <div className="p-3.5 rounded-xl bg-rose-950/80 border border-rose-800 text-xs font-semibold text-rose-300">
            ⚠️ {error}
          </div>
        )}

        <form className="space-y-5 font-sans" onSubmit={handleSubmit}>
          <div className="space-y-1.5">
            <label className="block text-[10px] font-mono font-bold text-[#adc6ff] uppercase tracking-wider">
              Email Address
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full h-12 px-4 bg-[#0f131d] border border-[#424754] rounded-xl text-xs text-[#dfe2f1] placeholder-[#8c909f] focus:outline-none focus:border-[#4d8eff] shadow-inner transition"
              placeholder="you@example.com"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-[10px] font-mono font-bold text-[#adc6ff] uppercase tracking-wider">
              Password
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full h-12 px-4 bg-[#0f131d] border border-[#424754] rounded-xl text-xs text-[#dfe2f1] placeholder-[#8c909f] focus:outline-none focus:border-[#4d8eff] shadow-inner transition"
              placeholder="••••••••"
            />
          </div>

          <div className="flex items-center justify-end text-xs pt-0.5">
            <Link
              href="/forgot-password"
              className="text-xs font-semibold text-[#4d8eff] hover:text-[#adc6ff] transition"
            >
              Forgot password?
            </Link>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full h-12 bg-gradient-to-r from-[#4d8eff] via-[#4d8eff] to-[#adc6ff] hover:opacity-95 disabled:opacity-50 text-[#0a0e18] font-extrabold text-xs rounded-xl shadow-lg shadow-[#4d8eff]/20 transition flex items-center justify-center space-x-2"
          >
            <span>{loading ? 'Signing in...' : 'Sign In'}</span>
          </button>
        </form>

        <div className="space-y-4 pt-1">
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-[#424754]/60" />
            </div>
            <div className="relative flex justify-center text-[10px] font-mono uppercase tracking-wider">
              <span className="bg-[#0a0e18] px-3 text-[#8c909f]">Or continue with</span>
            </div>
          </div>

          <button
            onClick={handleGoogleAuth}
            type="button"
            className="w-full h-12 bg-[#0f131d] hover:bg-[#141926] border border-[#424754] rounded-xl text-xs font-bold text-[#dfe2f1] flex items-center justify-center space-x-3 transition shadow-sm"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
            </svg>
            <span>Continue with Google</span>
          </button>
        </div>

        <div className="pt-2 text-center text-xs text-[#8c909f] font-sans">
          Don&apos;t have an account?{' '}
          <Link href="/register" className="text-[#4d8eff] hover:text-[#adc6ff] font-bold transition">
            Create account
          </Link>
        </div>
      </AuthCard>
    </AuthLayoutShell>
  );
}
