'use client';

import React, { useEffect, useState } from 'react';
import { useWorkspace } from '@/context/WorkspaceContext';
import { useRouter } from 'next/navigation';
import { AmbientBackground } from '@/components/dashboard/AmbientBackground';
import { WelcomeSection } from '@/components/dashboard/WelcomeSection';
import { WeatherCard } from '@/components/dashboard/WeatherCard';
import { StatCard } from '@/components/dashboard/StatCard';
import { QuickActionCard } from '@/components/dashboard/QuickActionCard';
import { CitySelectionModal } from '@/components/dashboard/CitySelectionModal';

export default function UserDashboardPage() {
  const router = useRouter();
  const {
    currentUser,
    activeCity,
    activeRegion,
    weather,
    locationStatus,
    updateCity,
    requestGeolocation
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
        const [statsRes, convsRes, kbsRes] = await Promise.all([
          fetch('/api/stats').then((r) => r.json()).catch(() => ({ data: { totalDocuments: 0 } })),
          fetch('/api/conversations').then((r) => r.json()).catch(() => ({ data: { total: 0 } })),
          fetch('/api/knowledge-bases').then((r) => r.json()).catch(() => ({ data: { total: 0 } }))
        ]);

        const docCount = typeof statsRes.data?.totalDocuments === 'number'
          ? statsRes.data.totalDocuments
          : (Array.isArray(statsRes.data) ? statsRes.data.length : (statsRes.data?.total || 0));

        const convCount = typeof convsRes.data?.total === 'number'
          ? convsRes.data.total
          : (Array.isArray(convsRes.data) ? convsRes.data.length : (convsRes.data?.items?.length || 0));

        const kbCount = typeof kbsRes.data?.total === 'number'
          ? kbsRes.data.total
          : (Array.isArray(kbsRes.data) ? kbsRes.data.length : (kbsRes.data?.items?.length || 0));

        setStats({
          docCount,
          convCount,
          kbCount
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
    <div className="relative min-h-screen p-4 sm:p-6 lg:p-8 font-sans selection:bg-[#4d8eff] selection:text-white text-slate-900 dark:text-[#dfe2f1]">
      {/* Subtle Animated Ambient Background */}
      <AmbientBackground />

      <div className="relative z-10 max-w-[1440px] mx-auto space-y-8">
        {/* Welcome Section & Weather Card Row */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <WelcomeSection
            userName={userName}
            activeCity={activeCity}
            activeRegion={activeRegion}
            locationStatus={locationStatus}
            onRequestGeolocation={requestGeolocation}
            onChangeCityClick={() => setShowCityModal(true)}
          />

          <WeatherCard
            activeCity={activeCity}
            weather={weather}
            onExploreClick={() => handleExplore(activeCity)}
          />
        </div>

        {/* 3-Card Statistics Row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          <StatCard
            title="Uploaded Documents"
            value={stats?.docCount ?? 0}
            loading={loading}
            icon="📤"
            accentColor="blue"
            delayMs={100}
          />
          <StatCard
            title="Active Conversations"
            value={stats?.convCount ?? 0}
            loading={loading}
            icon="💬"
            accentColor="emerald"
            delayMs={200}
          />
          <StatCard
            title="Knowledge Collections"
            value={stats?.kbCount ?? 0}
            loading={loading}
            icon="📁"
            accentColor="amber"
            delayMs={300}
          />
        </div>

        {/* Quick Actions Section */}
        <div className="space-y-4 pt-2">
          <h2 className="text-lg font-extrabold text-slate-900 dark:text-[#dfe2f1] tracking-tight font-sans">
            Quick Actions
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            <QuickActionCard
              title="Start RAG Conversation"
              description="Engage with stream & voice capabilities for deep document reasoning."
              icon="✨"
              href="/chat"
              accentColor="blue"
              delayMs={400}
            />

            <QuickActionCard
              title="Upload & Manage Files"
              description="Organize your enterprise knowledge base and track processing status."
              icon="📁"
              href="/documents"
              accentColor="emerald"
              delayMs={500}
            />

            <QuickActionCard
              title="Create AI Roadmap"
              description="Design structured AI learning paths and integration strategies."
              icon="📈"
              href="/roadmaps"
              accentColor="amber"
              delayMs={600}
            />

            <QuickActionCard
              title={`Explore ${activeCity}`}
              description="Discover local city insights powered by spatial intelligence."
              icon="🧭"
              onClick={() => handleExplore(activeCity)}
              accentColor="purple"
              delayMs={700}
            />
          </div>
        </div>
      </div>

      {/* Manual City Selection Modal */}
      <CitySelectionModal
        isOpen={showCityModal}
        onClose={() => setShowCityModal(false)}
        activeCity={activeCity}
        popularCities={popularCities}
        manualCityInput={manualCityInput}
        setManualCityInput={setManualCityInput}
        onSelectCity={handleSelectCity}
      />
    </div>
  );
}
