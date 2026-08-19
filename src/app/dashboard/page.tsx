'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useWorkspace } from '@/context/WorkspaceContext';
import { useRouter } from 'next/navigation';

export default function UserDashboardPage() {
  const router = useRouter();
  const {
    currentUser,
    activeCity,
    activeRegion,
    weather,
    locationStatus,
    updateCity,
    requestGeolocation,
    logout
  } = useWorkspace();

  const [stats, setStats] = useState<{ docCount: number; convCount: number; kbCount: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCityModal, setShowCityModal] = useState(false);
  const [manualCityInput, setManualCityInput] = useState('');

  const userName = currentUser?.name || currentUser?.email.split('@')[0] || 'User';
  const popularCities = ['Vadodara', 'Ahmedabad', 'Surat', 'Rajkot', 'Mumbai', 'Delhi', 'Bengaluru', 'Pune'];

  useEffect(() => {
    async function loadDashboardData() {
      try {
        const [docsRes, convsRes, kbsRes] = await Promise.all([
          fetch('/api/documents').then((r) => r.json()).catch(() => ({ data: [] })),
          fetch('/api/conversations').then((r) => r.json()).catch(() => ({ data: [] })),
          fetch('/api/knowledge-bases').then((r) => r.json()).catch(() => ({ data: [] }))
        ]);

        setStats({
          docCount: docsRes.data?.length || 0,
          convCount: convsRes.data?.length || 0,
          kbCount: kbsRes.data?.length || 0
        });
      } catch {
        setStats({ docCount: 0, convCount: 0, kbCount: 0 });
      } finally {
        setLoading(false);
      }
    }
    loadDashboardData();
  }, [currentUser]);

  const handleSelectCity = async (city: string) => {
    await updateCity(city);
    setShowCityModal(false);
  };

  const handleExplore = (targetCity?: string) => {
    const destination = targetCity || activeCity;
    router.push(`/explore?city=${encodeURIComponent(destination)}`);
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 p-4 sm:p-6 lg:p-8 transition-colors">
      <div className="w-full max-w-[1600px] mx-auto space-y-8">
        {/* Welcome Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-6">
          <div>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-slate-900 via-indigo-800 to-indigo-600 dark:from-white dark:to-indigo-300 bg-clip-text text-transparent">
              User Workspace Dashboard
            </h1>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
              Overview of your active documents, intelligent chats, and custom knowledge collections.
            </p>
          </div>

          {/* User Auth Profile / Login & Logout Bar */}
          <div className="flex items-center space-x-3">
            {currentUser ? (
              <div className="flex items-center space-x-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-2 px-3 rounded-2xl shadow-sm">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-600 to-purple-600 text-white font-bold flex items-center justify-center text-xs shadow-md">
                  {currentUser.name ? currentUser.name.slice(0, 2).toUpperCase() : 'U'}
                </div>
                <div className="flex flex-col">
                  <div className="flex items-center space-x-1.5">
                    <span className="text-xs font-bold text-slate-900 dark:text-white max-w-[120px] truncate">{currentUser.name}</span>
                    <span className="text-[9px] px-1.5 py-0.2 rounded bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-mono font-bold border border-indigo-200 dark:border-indigo-800 uppercase">
                      {currentUser.role}
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 max-w-[140px] truncate">{currentUser.email}</span>
                </div>
                <div className="h-6 w-px bg-slate-200 dark:bg-slate-800 mx-1" />
                <Link
                  href="/account"
                  className="px-2.5 py-1.5 rounded-xl text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                  title="Account Settings"
                >
                  👤 Profile
                </Link>
                <button
                  onClick={() => logout()}
                  className="px-3 py-1.5 rounded-xl text-xs font-semibold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/60 border border-rose-200 dark:border-rose-800/60 transition"
                >
                  🚪 Log Out
                </button>
              </div>
            ) : (
              <div className="flex items-center space-x-3">
                <Link
                  href="/login"
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-700 transition shadow-sm"
                >
                  🔑 Log In
                </Link>
                <Link
                  href="/register"
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 transition shadow-md shadow-indigo-600/20"
                >
                  Sign Up ✨
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* Phase 29 Personalized Welcome & Weather Card */}
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-3">
            <div className="flex items-center space-x-2">
              <h2 className="text-xl font-bold text-white">Welcome, {userName} 👋</h2>
              <span className="px-2.5 py-0.5 rounded-full bg-indigo-950 text-indigo-300 border border-indigo-800 text-[10px] font-mono">
                Active Location
              </span>
            </div>

            <div className="flex items-center space-x-3 text-xs text-slate-300">
              <span className="flex items-center space-x-1">
                <span>📍</span>
                <span className="font-semibold text-white">You are in {activeCity}, {activeRegion}</span>
              </span>
              <button
                onClick={() => setShowCityModal(true)}
                className="text-[11px] text-indigo-400 hover:text-indigo-300 underline font-medium transition"
              >
                Change City
              </button>
            </div>

            {/* Location Permission Callout */}
            {locationStatus === 'prompt' && (
              <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 text-xs flex items-center justify-between gap-3">
                <span className="text-slate-400">
                  Allow location access to personalize your city experience and weather.
                </span>
                <button
                  onClick={requestGeolocation}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-medium transition whitespace-nowrap"
                >
                  Use My Current Location
                </button>
              </div>
            )}

            {locationStatus === 'denied' && (
              <p className="text-[11px] text-amber-400">
                Location access denied. Using manual city selection ({activeCity}).
              </p>
            )}
          </div>

          {/* Weather Widget */}
          <div className="flex items-center justify-between md:justify-end gap-6 bg-slate-950/60 border border-slate-800/80 p-4 rounded-xl">
            <div className="space-y-0.5">
              <div className="text-2xl font-bold text-white flex items-center space-x-2">
                <span>{weather ? `${weather.temperature}°C` : '28°C'}</span>
                <span className="text-sm font-normal text-indigo-300">{weather?.condition || 'Partly Cloudy'}</span>
              </div>
              <div className="text-[11px] text-slate-400 font-mono">
                Feels like {weather?.feelsLike || 30}°C • High {weather?.high || 31}°C / Low {weather?.low || 24}°C
              </div>
            </div>

            <button
              onClick={() => handleExplore(activeCity)}
              className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs rounded-xl shadow-lg shadow-indigo-600/20 transition flex items-center space-x-1.5 whitespace-nowrap"
            >
              <span>🌍</span>
              <span>Explore {activeCity}</span>
            </button>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-lg flex items-center space-x-4">
            <div className="h-12 w-12 rounded-xl bg-indigo-950/80 border border-indigo-800/80 flex items-center justify-center text-indigo-400 text-xl font-bold">
              📄
            </div>
            <div>
              <div className="text-2xl font-bold text-white">{loading ? '...' : stats?.docCount ?? 0}</div>
              <div className="text-xs text-slate-400 font-medium">Uploaded Documents</div>
            </div>
          </div>

          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-lg flex items-center space-x-4">
            <div className="h-12 w-12 rounded-xl bg-sky-950/80 border border-sky-800/80 flex items-center justify-center text-sky-400 text-xl font-bold">
              💬
            </div>
            <div>
              <div className="text-2xl font-bold text-white">{loading ? '...' : stats?.convCount ?? 0}</div>
              <div className="text-xs text-slate-400 font-medium">Active Conversations</div>
            </div>
          </div>

          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-lg flex items-center space-x-4">
            <div className="h-12 w-12 rounded-xl bg-emerald-950/80 border border-emerald-800/80 flex items-center justify-center text-emerald-400 text-xl font-bold">
              📚
            </div>
            <div>
              <div className="text-2xl font-bold text-white">{loading ? '...' : stats?.kbCount ?? 0}</div>
              <div className="text-xs text-slate-400 font-medium">Knowledge Collections</div>
            </div>
          </div>
        </div>

        {/* Quick Action Navigation */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <Link
            href="/chat"
            className="p-5 rounded-2xl bg-slate-900/80 hover:bg-slate-800/80 border border-slate-800 hover:border-slate-700 text-left transition space-y-2 group"
          >
            <div className="text-xs font-bold text-indigo-400 uppercase tracking-wider font-mono">Stream & Voice RAG</div>
            <div className="text-sm font-semibold text-white group-hover:text-indigo-300">Start RAG Conversation →</div>
            <p className="text-xs text-slate-400">Ask questions over uploaded PDF documents, web sources, or general knowledge with TTS voice readout.</p>
          </Link>

          <Link
            href="/documents"
            className="p-5 rounded-2xl bg-slate-900/80 hover:bg-slate-800/80 border border-slate-800 hover:border-slate-700 text-left transition space-y-2 group"
          >
            <div className="text-xs font-bold text-sky-400 uppercase tracking-wider font-mono">Document Management</div>
            <div className="text-sm font-semibold text-white group-hover:text-sky-300">Upload & Manage Files →</div>
            <p className="text-xs text-slate-400">Upload PDFs, view page count, status, reprocess files, or manage document chunking.</p>
          </Link>

          <button
            onClick={() => handleExplore(activeCity)}
            className="p-5 rounded-2xl bg-slate-900/80 hover:bg-slate-800/80 border border-slate-800 hover:border-slate-700 text-left transition space-y-2 group w-full"
          >
            <div className="text-xs font-bold text-emerald-400 uppercase tracking-wider font-mono">City Explorer</div>
            <div className="text-sm font-semibold text-white group-hover:text-emerald-300">Explore {activeCity} →</div>
            <p className="text-xs text-slate-400">Discover places to visit, cuisine, culture, history, and shopping using Grounded Web Search.</p>
          </button>
        </div>
      </div>

      {/* Manual City Selection Modal */}
      {showCityModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-md w-full space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-semibold text-white">Choose City Manually</h3>
              <button onClick={() => setShowCityModal(false)} className="text-slate-400 hover:text-white text-xs">
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <input
                type="text"
                placeholder="Type city name..."
                value={manualCityInput}
                onChange={(e) => setManualCityInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && manualCityInput.trim()) {
                    handleSelectCity(manualCityInput.trim());
                  }
                }}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              />

              <div className="text-[11px] text-slate-400 font-medium">Popular Cities:</div>
              <div className="flex flex-wrap gap-2">
                {popularCities.map((c) => (
                  <button
                    key={c}
                    onClick={() => handleSelectCity(c)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                      activeCity === c
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-950 text-slate-300 hover:text-white border border-slate-800'
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
