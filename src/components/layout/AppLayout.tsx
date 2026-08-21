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
import { AppFooter } from './AppFooter';

function HeaderTourControls() {
  const { startTour } = useTour();
  const { buttonTitle, activeTour } = useContextualTour();

  return (
    <div className="flex items-center space-x-2 font-sans">
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

interface NavItem {
  name: string;
  href: string;
  icon: string;
  badge?: string;
}

interface NavGroup {
  id: string;
  title: string;
  icon: string;
  items: NavItem[];
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

  // Grouped Navigation Information Architecture
  const navigationGroups: NavGroup[] = [
    {
      id: 'core',
      title: 'CORE',
      icon: '🏠',
      items: [{ name: 'Dashboard', href: '/dashboard', icon: '🏠' }]
    },
    {
      id: 'ai-knowledge',
      title: 'AI & KNOWLEDGE',
      icon: '🧠',
      items: [
        { name: 'AI Copilot', href: '/copilot', icon: '🧠' },
        { name: 'RAG Chat', href: '/chat', icon: '💬' },
        { name: 'AI Study Mode', href: '/study', icon: '🎓' },
        { name: 'AI Voice Tutor', href: '/study/voice-tutor', icon: '🎤' },
        { name: 'Agentic Research', href: '/research', icon: '🔬' },
        { name: 'AI Roadmaps', href: '/roadmaps', icon: '🚀' },
        { name: 'Knowledge Graph', href: '/knowledge-graph', icon: '🕸️' }
      ]
    },
    {
      id: 'collaboration',
      title: 'COLLABORATION',
      icon: '💬',
      items: [{ name: 'Collab Chat', href: '/collab-chat', icon: '💬' }]
    },
    {
      id: 'workspace',
      title: 'WORKSPACE',
      icon: '📁',
      items: [
        { name: 'Project Workspaces', href: '/projects', icon: '📁' },
        { name: 'Documents', href: '/documents', icon: '📄' },
        { name: 'Knowledge Bases', href: '/knowledge-bases', icon: '📚' },
        { name: 'Copilot Memory', href: '/settings/copilot-memory', icon: '💾' }
      ]
    },
    {
      id: 'wellbeing',
      title: 'WELLBEING',
      icon: '🧘',
      items: [{ name: 'Chill & Focus', href: '/study/chill-focus', icon: '🧘' }]
    },
    {
      id: 'analytics',
      title: 'RESEARCH & ANALYTICS',
      icon: '📊',
      items: [
        { name: 'RAG Debugger', href: '/rag-debug', icon: '🐛' },
        { name: 'RAG Evaluation', href: '/rag-evaluation', icon: '📊' }
      ]
    },
    {
      id: 'explore',
      title: 'EXPLORE',
      icon: '<ctrl42>',
      items: [
        {
          name: activeCity ? `Explore ${activeCity}` : 'City Explorer',
          href: '/explore',
          icon: '🌆',
          badge: activeCity ? `📍 ${activeCity}` : undefined
        }
      ]
    },
    {
      id: 'account',
      title: 'ACCOUNT',
      icon: '👤',
      items: [{ name: 'My Account', href: '/account', icon: '👤' }]
    }
  ];

  // Helper to determine if a group contains the active route
  const groupContainsActiveRoute = (group: NavGroup): boolean => {
    return group.items.some((item) =>
      item.href === '/'
        ? pathname === '/'
        : pathname === item.href || pathname.startsWith(item.href + '/')
    );
  };

  // State for tracking expanded parent groups
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = { core: true };
    navigationGroups.forEach((group) => {
      if (groupContainsActiveRoute(group)) {
        initial[group.id] = true;
      }
    });
    return initial;
  });

  // Automatically expand group when pathname changes to an active route
  useEffect(() => {
    navigationGroups.forEach((group) => {
      const isCurrentActive = group.items.some((item) =>
        item.href === '/'
          ? pathname === '/'
          : pathname === item.href || pathname.startsWith(item.href + '/')
      );
      if (isCurrentActive) {
        setExpandedGroups((prev) => ({ ...prev, [group.id]: true }));
      }
    });
  }, [pathname]);

  const toggleGroup = (groupId: string) => {
    setExpandedGroups((prev) => ({
      ...prev,
      [groupId]: !prev[groupId]
    }));
  };

  if (isMarketingOrStandalone) {
    return (
      <div className="min-h-screen bg-[#0f131d] text-[#dfe2f1] font-sans selection:bg-[#4d8eff] selection:text-white">
        <main className="min-h-screen">{children}</main>
        <ProductTour />
      </div>
    );
  }

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
        {/* Desktop Left Collapsible Sidebar Navigation */}
        <aside className="hidden lg:flex flex-col w-64 shrink-0 bg-[#0a0e18] border-r border-[#424754]/60 sticky top-[61px] h-[calc(100vh-61px)] overflow-y-auto p-4 space-y-3 z-30 select-none">
          {navigationGroups.map((group) => {
            const hasActiveChild = groupContainsActiveRoute(group);
            const isExpanded = expandedGroups[group.id] ?? hasActiveChild;

            return (
              <div key={group.id} className="space-y-1">
                {/* Parent Menu Header */}
                <button
                  type="button"
                  onClick={() => toggleGroup(group.id)}
                  aria-expanded={isExpanded}
                  aria-controls={`submenu-${group.id}`}
                  className={`w-full px-3 py-2 rounded-xl text-[10px] font-mono font-bold tracking-widest uppercase transition-all flex items-center justify-between group ${
                    hasActiveChild
                      ? 'text-[#4d8eff] bg-[#4d8eff]/10 border border-[#4d8eff]/20'
                      : 'text-[#adc6ff]/80 hover:text-[#dfe2f1] hover:bg-[#171b26]'
                  }`}
                >
                  <div className="flex items-center space-x-2 truncate">
                    <span className="text-xs">{group.icon}</span>
                    <span className="truncate">{group.title}</span>
                  </div>
                  <span
                    className={`text-[10px] transform transition-transform duration-200 ${
                      isExpanded ? 'rotate-180 text-[#4d8eff]' : 'text-[#8c909f]'
                    }`}
                  >
                    ▼
                  </span>
                </button>

                {/* Collapsible Submenu */}
                {isExpanded && (
                  <div id={`submenu-${group.id}`} className="pl-2 space-y-1 animate-in fade-in duration-150">
                    {group.items.map((item) => {
                      const isActive =
                        item.href === '/'
                          ? pathname === '/'
                          : pathname === item.href || pathname.startsWith(item.href + '/');

                      return (
                        <Link
                          key={item.name}
                          href={item.href}
                          className={`px-3 py-2 rounded-xl text-xs font-semibold transition-all flex items-center justify-between ${
                            isActive
                              ? 'bg-[#4d8eff]/15 text-[#adc6ff] border border-[#4d8eff]/40 font-bold shadow-md shadow-[#4d8eff]/10'
                              : 'text-[#c2c6d6] hover:text-[#dfe2f1] hover:bg-[#1c1f2a] border border-transparent'
                          }`}
                        >
                          <div className="flex items-center space-x-2.5 truncate">
                            {isActive && <div className="w-1 h-3.5 rounded-full bg-[#4d8eff] shrink-0" />}
                            <span className="text-sm leading-none">{item.icon}</span>
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
                )}
              </div>
            );
          })}
        </aside>

        {/* Mobile Navigation Menu Drawer */}
        {isMobileMenuOpen && (
          <div className="lg:hidden fixed inset-0 z-50 bg-[#0f131d]/80 backdrop-blur-md flex font-sans">
            <div className="w-72 max-w-[80vw] bg-[#0a0e18] border-r border-[#424754] h-full p-4 overflow-y-auto space-y-4 shadow-2xl">
              <div className="flex items-center justify-between border-b border-[#424754]/60 pb-3">
                <span className="font-bold text-sm text-[#dfe2f1]">Navigation</span>
                <button
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="p-1 rounded-lg text-[#8c909f] hover:text-[#dfe2f1]"
                >
                  ✕
                </button>
              </div>

              {navigationGroups.map((group) => {
                const hasActiveChild = groupContainsActiveRoute(group);
                const isExpanded = expandedGroups[group.id] ?? hasActiveChild;

                return (
                  <div key={group.id} className="space-y-1">
                    <button
                      type="button"
                      onClick={() => toggleGroup(group.id)}
                      className="w-full px-3 py-2 rounded-xl text-[10px] font-mono font-bold tracking-widest uppercase flex items-center justify-between text-[#adc6ff]"
                    >
                      <div className="flex items-center space-x-2">
                        <span className="text-xs">{group.icon}</span>
                        <span>{group.title}</span>
                      </div>
                      <span className={`text-[10px] transform transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
                        ▼
                      </span>
                    </button>

                    {isExpanded && (
                      <div className="pl-2 space-y-1">
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
                                {isActive && <div className="w-1 h-3.5 rounded-full bg-[#4d8eff] shrink-0" />}
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
                    )}
                  </div>
                );
              })}
            </div>
            <div className="flex-1" onClick={() => setIsMobileMenuOpen(false)} />
          </div>
        )}

        {/* Main Application Content Area */}
        <main className="flex-1 min-w-0 flex flex-col min-h-full overflow-x-hidden">
          <div className="flex-1 min-w-0">{children}</div>
          <AppFooter />
        </main>
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
