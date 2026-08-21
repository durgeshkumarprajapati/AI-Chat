'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ProductTour } from '../tour/ProductTour';
import { ThemeToggle } from '../theme/ThemeToggle';
import NotificationCenter from '../notifications/NotificationCenter';
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
    fetch('/api/health')
      .then((res) => res.json())
      .then((data) => {
        if (data.status === 'ok') setHealthStatus('ok');
        else setHealthStatus('degraded');
      })
      .catch(() => setHealthStatus('degraded'));
  }, []);

  const isMarketingOrStandalone =
    pathname === '/' ||
    pathname === '/landing' ||
    pathname === '/login' ||
    pathname === '/register' ||
    pathname === '/study/chill-focus';

  if (isMarketingOrStandalone) {
    return (
      <div className="min-h-screen bg-[#0f131d] text-[#dfe2f1] font-sans selection:bg-[#4d8eff] selection:text-white">
        <main className="min-h-screen">{children}</main>
        <ProductTour />
      </div>
    );
  }

  const sidebarItems = [
    { name: 'Dashboard', href: '/dashboard', icon: '🏠' },
    { name: 'AI Copilot', href: '/copilot', icon: '🧠' },
    { name: 'Project Workspaces', href: '/projects', icon: '📁' },
    { name: 'RAG Chat', href: '/chat', icon: '💬' },
    { name: 'Collab Chat', href: '/collab-chat', icon: '💬' },
    { name: 'AI Study Mode', href: '/study', icon: '🎓' },
    { name: 'AI Voice Tutor', href: '/study/voice-tutor', icon: '🎤' },
    { name: 'Chill & Focus', href: '/study/chill-focus', icon: '🧘' },
    { name: 'Agentic Research', href: '/research', icon: '🔬' },
    { name: 'Workflows', href: '/workflows', icon: '🧩' },
    { name: 'AI Roadmaps', href: '/roadmaps', icon: '🚀' },
    { name: 'Documents', href: '/documents', icon: '📄' },
    { name: 'Knowledge Bases', href: '/knowledge-bases', icon: '📚' },
    { name: 'Knowledge Graph', href: '/knowledge-graph', icon: '🕸️' },
    {
      name: activeCity ? `Explore ${activeCity}` : 'City Explorer',
      href: '/explore',
      icon: '🌆',
      badge: activeCity ? `📍 ${activeCity}` : undefined
    },
    { name: 'Copilot Memory', href: '/settings/copilot-memory', icon: '💾' },
    { name: 'My Account', href: '/account', icon: '👤' },
    { name: 'RAG Debugger', href: '/rag-debug', icon: '🐛' },
    { name: 'RAG Evaluation', href: '/rag-evaluation', icon: '📊' }
  ];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col font-sans selection:bg-indigo-500 selection:text-white transition-colors">
      {/* Clean Top Application Header */}
      <header className="sticky top-0 z-40 bg-white/90 dark:bg-slate-950/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800/80 px-4 lg:px-8 py-3 flex items-center justify-between">
        <div className="flex items-center space-x-4">
          {/* Mobile Drawer Toggle */}
          <button
            onClick={() => setIsMobileMenuOpen((prev) => !prev)}
            className="lg:hidden p-2 rounded-xl text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900 border border-slate-200 dark:border-slate-800 transition"
            aria-label="Toggle Navigation Menu"
          >
            {isMobileMenuOpen ? '✕' : '☰'}
          </button>

          {/* Application Branding Logo */}
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
        </div>

        {/* Global Controls Area */}
        <div className="flex items-center space-x-3">
          {/* Services Health Indicator */}
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

          {/* Notification Center Bell */}
          <NotificationCenter />

          {/* Theme Selector */}
          <ThemeToggle />

          {/* Product Tour Controls */}
          <HeaderTourControls />

          {/* User Account / Auth Menu */}
          <UserProfileMenu />
        </div>
      </header>

      {/* Main Body Shell: Left Sidebar + Main Content */}
      <div className="flex-1 flex min-h-[calc(100vh-61px)]">
        {/* Desktop Left Sidebar Navigation */}
        <aside className="hidden lg:flex flex-col w-64 shrink-0 bg-white dark:bg-slate-950 border-r border-slate-200 dark:border-slate-800/80 sticky top-[61px] h-[calc(100vh-61px)] overflow-y-auto p-4 space-y-1 z-30">
          <div className="px-3 py-1.5 text-[10px] font-mono uppercase font-bold text-slate-400 dark:text-slate-500 tracking-wider">
            Navigation
          </div>
          {sidebarItems.map((item) => {
            const isActive =
              item.href === '/'
                ? pathname === '/'
                : pathname === item.href || pathname.startsWith(item.href + '/');

            return (
              <Link
                key={item.name}
                href={item.href}
                className={`px-3 py-2.5 rounded-xl text-xs font-medium transition-all flex items-center justify-between ${
                  isActive
                    ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 font-semibold border border-indigo-200 dark:border-indigo-800/80 shadow-sm'
                    : 'text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-900 border border-transparent'
                }`}
              >
                <div className="flex items-center space-x-2.5 truncate">
                  <span className="text-base leading-none">{item.icon}</span>
                  <span className="truncate">{item.name}</span>
                </div>
                {item.badge && (
                  <span className="text-[10px] px-2 py-0.5 rounded-md bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 font-semibold whitespace-nowrap">
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </aside>

        {/* Mobile Navigation Menu Drawer */}
        {isMobileMenuOpen && (
          <div className="lg:hidden fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex">
            <div className="w-72 max-w-[80vw] bg-white dark:bg-slate-950 border-r border-slate-200 dark:border-slate-800 h-full p-4 overflow-y-auto space-y-1 shadow-2xl">
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3 mb-2">
                <span className="font-bold text-sm text-slate-900 dark:text-white">Navigation</span>
                <button
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="p-1 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white"
                >
                  ✕
                </button>
              </div>
              {sidebarItems.map((item) => {
                const isActive =
                  item.href === '/'
                    ? pathname === '/'
                    : pathname === item.href || pathname.startsWith(item.href + '/');

                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    onClick={() => setIsMobileMenuOpen(false)}
                    className={`px-3 py-2.5 rounded-xl text-xs font-medium transition-all flex items-center justify-between ${
                      isActive
                        ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 font-semibold border border-indigo-200 dark:border-indigo-800/80 shadow-sm'
                        : 'text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-900'
                    }`}
                  >
                    <div className="flex items-center space-x-2.5 truncate">
                      <span className="text-base leading-none">{item.icon}</span>
                      <span className="truncate">{item.name}</span>
                    </div>
                    {item.badge && (
                      <span className="text-[10px] px-2 py-0.5 rounded-md bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 font-semibold whitespace-nowrap">
                        {item.badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
            <div className="flex-1" onClick={() => setIsMobileMenuOpen(false)} />
          </div>
        )}

        {/* Main Application Content Area */}
        <main className="flex-1 min-w-0 overflow-x-hidden">{children}</main>
      </div>

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
