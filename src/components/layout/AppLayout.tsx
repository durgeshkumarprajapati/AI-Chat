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
        className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-[#0f131d] hover:bg-[#141926] text-[#adc6ff] border border-[#424754] text-xs font-semibold transition-all shadow-sm"
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

  // Categorized Navigation Item Groups
  const navigationGroups = [
    {
      title: 'MAIN',
      items: [
        { name: 'Dashboard', href: '/dashboard', icon: '🏠' },
        { name: 'AI Copilot', href: '/copilot', icon: '🧠' },
        { name: 'Project Workspaces', href: '/projects', icon: '📁' },
        { name: 'RAG Chat', href: '/chat', icon: '💬' },
        { name: 'Collab Chat', href: '/collab-chat', icon: '💬' }
      ]
    },
    {
      title: 'STUDY & FOCUS',
      items: [
        { name: 'AI Study Mode', href: '/study', icon: '🎓' },
        { name: 'AI Voice Tutor', href: '/study/voice-tutor', icon: '🎤' },
        { name: 'Chill & Focus', href: '/study/chill-focus', icon: '🧘' }
      ]
    },
    {
      title: 'INTELLIGENCE & RESEARCH',
      items: [
        { name: 'Agentic Research', href: '/research', icon: '🔬' },
        { name: 'Workflows', href: '/workflows', icon: '🧩' },
        { name: 'AI Roadmaps', href: '/roadmaps', icon: '🚀' },
        {
          name: activeCity ? `Explore ${activeCity}` : 'City Explorer',
          href: '/explore',
          icon: '🌆',
          badge: activeCity ? `📍 ${activeCity}` : undefined
        }
      ]
    },
    {
      title: 'KNOWLEDGE BASE',
      items: [
        { name: 'Documents', href: '/documents', icon: '📄' },
        { name: 'Knowledge Bases', href: '/knowledge-bases', icon: '📚' },
        { name: 'Knowledge Graph', href: '/knowledge-graph', icon: '🕸️' },
        { name: 'Copilot Memory', href: '/settings/copilot-memory', icon: '💾' }
      ]
    },
    {
      title: 'SYSTEM & DEV',
      items: [
        { name: 'My Account', href: '/account', icon: '👤' },
        { name: 'RAG Debugger', href: '/rag-debug', icon: '🐛' },
        { name: 'RAG Evaluation', href: '/rag-evaluation', icon: '📊' }
      ]
    }
  ];

  return (
    <div className="min-h-screen bg-[#0f131d] text-[#dfe2f1] flex flex-col font-sans selection:bg-[#4d8eff] selection:text-white transition-colors">
      {/* Premium Enterprise Header */}
      <header className="sticky top-0 z-40 bg-[#0a0e18]/90 backdrop-blur-md border-b border-[#424754]/60 px-4 lg:px-8 py-3 flex items-center justify-between shadow-lg">
        <div className="flex items-center space-x-4">
          {/* Mobile Drawer Toggle */}
          <button
            onClick={() => setIsMobileMenuOpen((prev) => !prev)}
            className="lg:hidden p-2 rounded-xl text-[#c2c6d6] hover:text-[#dfe2f1] bg-[#0f131d] hover:bg-[#141926] border border-[#424754] transition"
            aria-label="Toggle Navigation Menu"
          >
            {isMobileMenuOpen ? '✕' : '☰'}
          </button>

          {/* Application Branding Logo */}
          <Link href="/" className="flex items-center space-x-3 group">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#4d8eff] to-[#adc6ff] flex items-center justify-center font-extrabold text-[#0a0e18] shadow-lg shadow-[#4d8eff]/20 group-hover:scale-105 transition-transform text-xs">
              AI
            </div>
            <div className="flex flex-col">
              <span className="font-extrabold text-base tracking-tight text-[#dfe2f1] group-hover:text-[#adc6ff] transition-colors font-sans">
                Document AI
              </span>
              <span className="text-[9px] text-[#8c909f] font-mono tracking-widest font-bold">ENTERPRISE PLATFORM</span>
            </div>
          </Link>
        </div>

        {/* Global Header Controls */}
        <div className="flex items-center space-x-3">
          {/* Services Health Indicator */}
          <Link
            href="/health"
            className="hidden sm:flex items-center space-x-2 px-3.5 py-1.5 rounded-full bg-[#0f131d] hover:bg-[#141926] border border-[#424754] text-xs font-mono transition-colors shadow-sm"
          >
            <span
              className={`w-2 h-2 rounded-full ${
                healthStatus === 'ok'
                  ? 'bg-[#4edea3] shadow-sm shadow-[#4edea3]/50 animate-pulse'
                  : healthStatus === 'degraded'
                  ? 'bg-[#ffb95f]'
                  : 'bg-[#8c909f]'
              }`}
            />
            <span className="text-[#dfe2f1] font-bold">
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
        <aside className="hidden lg:flex flex-col w-64 shrink-0 bg-[#0a0e18] border-r border-[#424754]/60 sticky top-[61px] h-[calc(100vh-61px)] overflow-y-auto p-4 space-y-6 z-30 select-none">
          {navigationGroups.map((group) => (
            <div key={group.title} className="space-y-1.5">
              <div className="px-3 py-1 text-[10px] font-mono font-bold text-[#adc6ff] tracking-widest uppercase opacity-80">
                {group.title}
              </div>
              {group.items.map((item) => {
                const isActive =
                  item.href === '/'
                    ? pathname === '/'
                    : pathname === item.href || pathname.startsWith(item.href + '/');

                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={`px-3 py-2.5 rounded-xl text-xs font-semibold transition-all flex items-center justify-between group ${
                      isActive
                        ? 'bg-[#4d8eff]/15 text-[#adc6ff] border border-[#4d8eff]/40 font-bold shadow-md shadow-[#4d8eff]/10'
                        : 'text-[#c2c6d6] hover:text-[#dfe2f1] hover:bg-[#1c1f2a] border border-transparent'
                    }`}
                  >
                    <div className="flex items-center space-x-2.5 truncate">
                      {isActive && <div className="w-1 h-4 rounded-full bg-[#4d8eff] shrink-0" />}
                      <span className="text-base leading-none">{item.icon}</span>
                      <span className="truncate">{item.name}</span>
                    </div>
                    {item.badge && (
                      <span className="text-[9px] px-2 py-0.5 rounded-md bg-[#4d8eff]/10 text-[#adc6ff] border border-[#4d8eff]/30 font-mono font-bold whitespace-nowrap">
                        {item.badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
        </aside>

        {/* Mobile Navigation Menu Drawer */}
        {isMobileMenuOpen && (
          <div className="lg:hidden fixed inset-0 z-50 bg-[#0f131d]/80 backdrop-blur-md flex">
            <div className="w-72 max-w-[80vw] bg-[#0a0e18] border-r border-[#424754] h-full p-4 overflow-y-auto space-y-5 shadow-2xl">
              <div className="flex items-center justify-between border-b border-[#424754]/60 pb-3">
                <span className="font-bold text-sm text-[#dfe2f1]">Navigation</span>
                <button
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="p-1 rounded-lg text-[#8c909f] hover:text-[#dfe2f1]"
                >
                  ✕
                </button>
              </div>

              {navigationGroups.map((group) => (
                <div key={group.title} className="space-y-1">
                  <div className="px-3 py-1 text-[10px] font-mono font-bold text-[#adc6ff] tracking-widest uppercase">
                    {group.title}
                  </div>
                  {group.items.map((item) => {
                    const isActive =
                      item.href === '/'
                        ? pathname === '/'
                        : pathname === item.href || pathname.startsWith(item.href + '/');

                    return (
                      <Link
                        key={item.name}
                        href={item.href}
                        onClick={() => setIsMobileMenuOpen(false)}
                        className={`px-3 py-2.5 rounded-xl text-xs font-semibold transition-all flex items-center justify-between ${
                          isActive
                            ? 'bg-[#4d8eff]/15 text-[#adc6ff] border border-[#4d8eff]/40 font-bold'
                            : 'text-[#c2c6d6] hover:text-[#dfe2f1] hover:bg-[#1c1f2a]'
                        }`}
                      >
                        <div className="flex items-center space-x-2.5 truncate">
                          {isActive && <div className="w-1 h-4 rounded-full bg-[#4d8eff] shrink-0" />}
                          <span className="text-base leading-none">{item.icon}</span>
                          <span className="truncate">{item.name}</span>
                        </div>
                        {item.badge && (
                          <span className="text-[9px] px-2 py-0.5 rounded-md bg-[#4d8eff]/10 text-[#adc6ff] border border-[#4d8eff]/30 font-mono font-bold whitespace-nowrap">
                            {item.badge}
                          </span>
                        )}
                      </Link>
                    );
                  })}
                </div>
              ))}
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
