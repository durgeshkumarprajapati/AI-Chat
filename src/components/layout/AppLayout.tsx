'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import { ProductTour } from '../tour/ProductTour';
import { ThemeToggle } from '../theme/ThemeToggle';
import { useWorkspace } from '@/context/WorkspaceContext';

export function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { currentUser, activeCity } = useWorkspace();
  const [isTourOpen, setIsTourOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [healthStatus, setHealthStatus] = useState<'ok' | 'degraded' | 'loading'>('loading');

  useEffect(() => {
    // Check if tour was completed
    const completed = localStorage.getItem('docai_tour_completed');
    if (!completed) {
      setIsTourOpen(true);
    }

    // Fetch initial health status
    fetch('/api/health')
      .then((res) => res.json())
      .then((data) => {
        if (data.status === 'ok') setHealthStatus('ok');
        else setHealthStatus('degraded');
      })
      .catch(() => setHealthStatus('degraded'));
  }, []);

  const isAdmin = currentUser?.role === 'ADMIN';

  const navItems = [
    { name: 'Dashboard', href: '/dashboard', icon: '📊' },
    { name: 'Knowledge Graph', href: '/knowledge-graph', icon: '🌐', badge: 'NEW' },
    { name: 'AI Copilot', href: '/copilot', icon: '🧠', badge: 'NEW' },
    { name: 'Project Workspaces', href: '/projects', icon: '📁', badge: 'NEW' },
    { name: 'RAG Chat', href: '/chat', icon: '💬' },
    { name: 'AI Study Mode', href: '/study', icon: '🎓' },
    { name: 'Agentic Research', href: '/research', icon: '🤖' },
    { name: 'Workflows', href: '/workflows', icon: '🧩' },
    { name: 'AI Roadmaps', href: '/roadmaps', icon: '🚀' },
    { name: 'Documents', href: '/documents', icon: '📁' },
    { name: 'Knowledge Bases', href: '/knowledge-bases', icon: '📚' },
    { name: `Explore ${activeCity}`, href: `/explore?city=${encodeURIComponent(activeCity)}`, icon: '🌍' },
    { name: 'Copilot Memory', href: '/settings/copilot-memory', icon: '💾' },
    { name: 'My Account', href: '/account', icon: '👤' },
    ...(isAdmin
      ? [
          { name: 'Admin Dashboard', href: '/admin', icon: '👑', badge: 'ADMIN' },
          { name: 'Audit Logs', href: '/admin/audit-logs', icon: '📜', badge: 'ADMIN' },
          { name: 'RAG Quality', href: '/rag-evaluation', icon: '📈' },
          { name: 'RAG Inspector', href: '/rag-debug', icon: '🔍' },
          { name: 'System Health', href: '/health', icon: '🩺' }
        ]
      : [])
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col md:flex-row font-sans antialiased">
      {/* Product Tour Modal */}
      <ProductTour isOpen={isTourOpen} onClose={() => setIsTourOpen(false)} />

      {/* Sidebar Navigation - Desktop */}
      <aside className="hidden md:flex flex-col w-64 border-r border-slate-800 bg-slate-900/50 p-4 space-y-6 flex-shrink-0">
        <div className="flex items-center space-x-3 px-2 py-1">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-indigo-400 flex items-center justify-center font-bold text-white shadow-lg shadow-indigo-500/20 text-lg">
            AI
          </div>
          <div>
            <h1 className="font-bold text-white tracking-tight text-base">Document AI</h1>
            <p className="text-xs text-slate-400 font-mono">RAG Platform v0.10</p>
          </div>
        </div>

        <nav className="flex-1 space-y-1.5">
          {navItems.map((item) => {
            const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
            return (
              <Link
                key={item.name}
                href={item.href}
                className={`flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-indigo-600/10 text-indigo-400 border border-indigo-500/20'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`}
              >
                <div className="flex items-center space-x-3">
                  <span className="text-lg">{item.icon}</span>
                  <span>{item.name}</span>
                </div>
                {item.badge && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-800 text-indigo-400 border border-slate-700">
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Local Infrastructure Badge */}
        <div className="rounded-xl bg-slate-900 border border-slate-800 p-3 space-y-2 text-xs">
          <div className="flex items-center justify-between text-slate-400">
            <span>Pipeline Infrastructure</span>
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          </div>
          <div className="font-mono text-[11px] text-slate-300 space-y-0.5">
            <p>• Pgvector 0.8.6 (768d)</p>
            <p>• Ollama nomic-embed</p>
            <p>• RabbitMQ Worker</p>
          </div>
        </div>
      </aside>

      {/* Main Content Container */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Header */}
        <header className="h-16 border-b border-slate-800 bg-slate-900/30 px-4 md:px-8 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center space-x-3 md:hidden">
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
            >
              ☰
            </button>
            <span className="font-bold text-white text-lg">Document AI</span>
          </div>

          <div className="hidden md:flex items-center space-x-3 text-xs">
            {currentUser ? (
              <Link href="/account" className="flex items-center space-x-2 px-3 py-1.5 rounded-full bg-slate-900 border border-slate-800 hover:border-slate-700 transition">
                <div className="w-5 h-5 rounded-full bg-indigo-600 flex items-center justify-center text-[10px] font-bold text-white uppercase">
                  {currentUser.name?.[0] || currentUser.email[0]}
                </div>
                <span className="font-medium text-slate-200">{currentUser.name || currentUser.email}</span>
                <span className={`px-1.5 py-0.2 text-[9px] font-mono font-bold rounded ${currentUser.role === 'ADMIN' ? 'bg-rose-950 text-rose-300 border border-rose-800' : 'bg-indigo-950 text-indigo-300 border border-indigo-800'}`}>
                  {currentUser.role}
                </span>
              </Link>
            ) : (
              <Link href="/login" className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium">
                Sign In
              </Link>
            )}
          </div>

          <div className="flex items-center space-x-3">
            {/* System Status Pill */}
            <Link
              href="/health"
              className="flex items-center space-x-2 px-3 py-1.5 rounded-full bg-slate-900 border border-slate-800 text-xs font-medium hover:border-slate-700 transition-colors"
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  healthStatus === 'ok'
                    ? 'bg-emerald-400 shadow-sm shadow-emerald-400/50'
                    : healthStatus === 'degraded'
                    ? 'bg-amber-400'
                    : 'bg-slate-500'
                }`}
              />
              <span className="text-slate-300">
                {healthStatus === 'ok' ? 'Services Healthy' : healthStatus === 'degraded' ? 'Degraded Status' : 'Checking Health...'}
              </span>
            </Link>

            {/* Theme Selector */}
            <ThemeToggle />

            {/* Product Tour Trigger */}
            <button
              onClick={() => setIsTourOpen(true)}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-400 border border-indigo-500/20 text-xs font-semibold transition-all"
            >
              <span>Take Tour</span>
              <span>✨</span>
            </button>
          </div>
        </header>

        {/* Mobile Menu Drawer */}
        {isMobileMenuOpen && (
          <div className="md:hidden bg-slate-900 border-b border-slate-800 p-4 space-y-2">
            {navItems.map((item) => (
              <Link
                key={item.name}
                href={item.href}
                onClick={() => setIsMobileMenuOpen(false)}
                className="flex items-center justify-between px-3 py-2.5 rounded-lg text-sm text-slate-300 hover:bg-slate-800"
              >
                <span>{item.name}</span>
                {item.badge && <span className="text-xs text-indigo-400">{item.badge}</span>}
              </Link>
            ))}
          </div>
        )}

        {/* Page Content */}
        <main className="flex-1 p-4 md:p-8 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
