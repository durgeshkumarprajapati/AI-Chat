'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import { ProductTour } from '../tour/ProductTour';
import { ThemeToggle } from '../theme/ThemeToggle';
import { useWorkspace } from '@/context/WorkspaceContext';
import { TourProvider, useTour } from '@/features/tours/components/TourProvider';
import { TourHelpButton } from '@/features/tours/components/TourHelpButton';
import { useContextualTour } from '@/features/tours/hooks/useContextualTour';
import { UserProfileMenu } from '../auth/UserProfileMenu';

function HeaderTourControls() {
  const { startTour } = useTour();
  const { buttonTitle, activeTour } = useContextualTour();

  return (
    <div className="flex items-center space-x-2">
      <TourHelpButton />
      <button
        onClick={() => startTour(activeTour.id)}
        className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-400 border border-indigo-500/20 text-xs font-semibold transition-all shadow-sm"
        title={`Take ${buttonTitle}`}
      >
        <span>{buttonTitle}</span>
        <span>✨</span>
      </button>
    </div>
  );
}

function InnerAppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { activeCity } = useWorkspace();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [healthStatus, setHealthStatus] = useState<'ok' | 'degraded' | 'loading'>('loading');

  useEffect(() => {
    // Fetch initial health status
    fetch('/api/health')
      .then((res) => res.json())
      .then((data) => {
        if (data.status === 'ok') setHealthStatus('ok');
        else setHealthStatus('degraded');
      })
      .catch(() => setHealthStatus('degraded'));
  }, []);

  const navItems = [
    { name: 'Dashboard', href: '/' },
    { name: 'RAG Chat', href: '/chat' },
    { name: 'Documents', href: '/documents' },
    { name: 'Knowledge Bases', href: '/knowledge-bases' },
    { name: 'Knowledge Graph', href: '/knowledge-graph', badge: 'Phase 41' },
    { name: 'City Explorer', href: '/explore', badge: activeCity ? `📍 ${activeCity}` : 'Phase 43' },
    { name: 'AI Study Mode', href: '/study', badge: 'Phase 33' },
    { name: 'Agentic Research', href: '/research', badge: 'Phase 34' },
    { name: 'Workflows', href: '/workflows', badge: 'Phase 35' },
    { name: 'Copilot', href: '/copilot', badge: 'Phase 36' },
    { name: 'Project Workspaces', href: '/projects', badge: 'Phase 36' },
    { name: 'AI Roadmaps', href: '/roadmaps' },
    { name: 'RAG Debugger', href: '/rag-debug' },
    { name: 'RAG Evaluation', href: '/rag-evaluation' }
  ];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col font-sans selection:bg-indigo-500 selection:text-white transition-colors">
      {/* Top Header Navigation */}
      <header className="sticky top-0 z-40 bg-white/90 dark:bg-slate-950/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800/80 px-4 lg:px-8 py-3 flex items-center justify-between">
        <div className="flex items-center space-x-6">
          <Link href="/" className="flex items-center space-x-3 group">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-purple-500 flex items-center justify-center font-bold text-white shadow-lg shadow-indigo-500/20 group-hover:scale-105 transition-transform">
              AI
            </div>
            <div className="flex flex-col">
              <span className="font-bold text-base tracking-tight text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                Document AI
              </span>
              <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono tracking-wider">ENTERPRISE PLATFORM</span>
            </div>
          </Link>

          {/* Desktop Nav Items */}
          <nav className="hidden lg:flex items-center space-x-1">
            {navItems.slice(0, 7).map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center space-x-1.5 ${
                    isActive
                      ? 'bg-slate-200 dark:bg-slate-800 text-slate-900 dark:text-white font-semibold shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-900'
                  }`}
                >
                  <span>{item.name}</span>
                  {item.badge && (
                    <span className="text-[10px] px-1.5 py-0.2 bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-400 rounded border border-indigo-200 dark:border-indigo-800 font-semibold">
                      {item.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center space-x-3">
          {/* System Status Pill */}
          <Link
            href="/health"
            className="hidden sm:flex items-center space-x-2 px-3 py-1.5 rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-medium hover:border-slate-300 dark:hover:border-slate-700 transition-colors shadow-sm"
          >
            <span
              className={`w-2 h-2 rounded-full ${
                healthStatus === 'ok'
                  ? 'bg-emerald-500 dark:bg-emerald-400 shadow-sm shadow-emerald-400/50'
                  : healthStatus === 'degraded'
                  ? 'bg-amber-500 dark:bg-amber-400'
                  : 'bg-slate-400 dark:bg-slate-500'
              }`}
            />
            <span className="text-slate-700 dark:text-slate-300">
              {healthStatus === 'ok' ? 'Services Healthy' : healthStatus === 'degraded' ? 'Degraded Status' : 'Checking Health...'}
            </span>
          </Link>

          {/* Theme Selector */}
          <ThemeToggle />

          {/* Contextual Product Tour Header Controls */}
          <HeaderTourControls />

          {/* User Auth Profile & Logout / Login Buttons */}
          <UserProfileMenu />
        </div>
      </header>

      {/* Mobile Menu Drawer */}
      {isMobileMenuOpen && (
        <div className="md:hidden bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 p-4 space-y-2">
          {navItems.map((item) => (
            <Link
              key={item.name}
              href={item.href}
              onClick={() => setIsMobileMenuOpen(false)}
              className="flex items-center justify-between px-3 py-2.5 rounded-lg text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <span>{item.name}</span>
              {item.badge && <span className="text-xs text-indigo-600 dark:text-indigo-400">{item.badge}</span>}
            </Link>
          ))}
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col">{children}</main>

      {/* Universal Product Tour Overlay */}
      <ProductTour />
    </div>
  );
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <TourProvider>
      <InnerAppLayout>{children}</InnerAppLayout>
    </TourProvider>
  );
}
