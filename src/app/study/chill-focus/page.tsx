'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChillFocusShell } from '@/components/chill-focus/ChillFocusShell';
import { ChillFocusModeToggle } from '@/components/chill-focus/ChillFocusModeToggle';
import { BreathingGuide } from '@/components/chill-focus/BreathingGuide';
import { SoundscapeSelector } from '@/components/chill-focus/SoundscapeSelector';
import { SoundscapePlayer } from '@/components/chill-focus/SoundscapePlayer';
import { CalmStreakBadge } from '@/components/chill-focus/CalmStreakBadge';
import { AiInterventionBubble } from '@/components/chill-focus/AiInterventionBubble';
import { ChillFocusControls } from '@/components/chill-focus/ChillFocusControls';
import { SessionSummary } from '@/components/chill-focus/SessionSummary';
import { CalmStreakSummaryDTO, ChillFocusSessionDTO } from '@/features/chill-focus/chill-focus.types';

export default function ChillFocusPage() {
  const router = useRouter();

  const [mode, setMode] = useState<'CHILL' | 'FOCUS'>('CHILL');
  const [session, setSession] = useState<ChillFocusSessionDTO | null>(null);
  const [streak, setStreak] = useState<CalmStreakSummaryDTO | null>(null);
  const [soundscape, setSoundscape] = useState<string>('night_sky');
  const [volume, setVolume] = useState<number>(0.7);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [showSummary, setShowSummary] = useState<boolean>(false);
  const [aiMessage, setAiMessage] = useState<string | null>(null);
  const [showAiBubble, setShowAiBubble] = useState<boolean>(true);
  const [navCollapsed, setNavCollapsed] = useState<boolean>(true);
  const [reducedMotion, setReducedMotion] = useState<boolean>(false);

  // Initialize session and preferences
  useEffect(() => {
    // Check reduced motion preference
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(motionQuery.matches);

    const init = async () => {
      try {
        // 1. Fetch Streak
        const streakRes = await fetch('/api/study/chill-focus/streak');
        const streakData = await streakRes.json();
        if (streakData.success && streakData.data) {
          setStreak(streakData.data);
        }

        // 2. Fetch Preferences
        const prefRes = await fetch('/api/study/chill-focus/preferences');
        const prefData = await prefRes.json();
        if (prefData.success && prefData.data) {
          setSoundscape(prefData.data.preferredSoundscape || 'night_sky');
          setVolume(prefData.data.preferredVolume ?? 0.7);
          setMode((prefData.data.preferredMode as 'CHILL' | 'FOCUS') || 'CHILL');
        }

        // 3. Get or Create Session
        const sessRes = await fetch('/api/study/chill-focus/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode: 'CHILL', soundscape: 'night_sky' })
        });
        const sessData = await sessRes.json();
        if (sessData.success && sessData.data) {
          setSession(sessData.data);
          setIsPaused(sessData.data.status === 'PAUSED');
        }

        // 4. Fetch AI Intervention Break Suggestion
        const aiRes = await fetch('/api/study/chill-focus/intervention?studyMinutes=52');
        const aiData = await aiRes.json();
        if (aiData.success && aiData.data?.message) {
          setAiMessage(aiData.data.message);
        }
      } catch (err) {
        console.warn('[ChillFocusPage] Init fetch failed, using defaults:', err);
      }
    };

    init();
  }, []);

  const handleModeToggle = (newMode: 'CHILL' | 'FOCUS') => {
    setMode(newMode);
  };

  const handleSoundscapeSelect = (newSoundscape: string) => {
    setSoundscape(newSoundscape);
    // Persist preference asynchronously
    fetch('/api/study/chill-focus/preferences', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ preferredSoundscape: newSoundscape })
    }).catch(() => null);
  };

  const handlePauseToggle = async () => {
    if (!session) return;
    const targetAction = isPaused ? 'resume' : 'pause';

    try {
      const res = await fetch(`/api/study/chill-focus/session/${session.id}/${targetAction}`, {
        method: 'POST'
      });
      const data = await res.json();
      if (data.success && data.data) {
        setSession(data.data);
        setIsPaused(data.data.status === 'PAUSED');
      } else {
        setIsPaused(!isPaused);
      }
    } catch {
      setIsPaused(!isPaused);
    }
  };

  const handleExitMode = async () => {
    if (session && session.status !== 'COMPLETED') {
      try {
        const res = await fetch(`/api/study/chill-focus/session/${session.id}/complete`, {
          method: 'POST'
        });
        const data = await res.json();
        if (data.success && data.data) {
          setSession(data.data.session);
          setStreak(data.data.streak);
          setShowSummary(true);
          return;
        }
      } catch (err) {
        console.warn('[ChillFocusPage] Error completing session on exit:', err);
      }
    }
    router.push('/study');
  };

  return (
    <ChillFocusShell mode={mode} reducedMotion={reducedMotion}>
      {/* Top Header Bar */}
      <header className="flex items-center justify-between p-4 sm:p-6 w-full max-w-7xl mx-auto z-20">
        {/* Left: Collapsible Sidebar Menu Icon */}
        <div className="flex items-center space-x-3">
          <button
            onClick={() => setNavCollapsed(!navCollapsed)}
            aria-label="Toggle navigation menu"
            className="w-10 h-10 rounded-2xl bg-slate-900/80 hover:bg-slate-800 border border-slate-800 flex items-center justify-center text-white text-lg transition shadow-lg"
          >
            <span>{navCollapsed ? '🧊' : '✕'}</span>
          </button>

          {!navCollapsed && (
            <nav className="flex items-center space-x-2 bg-slate-900/90 border border-slate-800 rounded-2xl px-4 py-2 text-xs font-bold text-slate-300">
              <Link href="/study" className="hover:text-white transition">Study Mode</Link>
              <span>•</span>
              <Link href="/dashboard" className="hover:text-white transition">Dashboard</Link>
              <span>•</span>
              <Link href="/chat" className="hover:text-white transition">RAG Chat</Link>
            </nav>
          )}
        </div>

        {/* Right: Calm Streak Badge, Sound Controls, Exit Button */}
        <div className="flex items-center space-x-3">
          <CalmStreakBadge
            streakDays={streak?.currentStreakDays || 0}
            earnedToday={streak?.earnedToday || false}
          />

          <SoundscapePlayer
            soundscapeId={soundscape}
            volume={volume}
            isMuted={isMuted}
            onVolumeChange={setVolume}
            onMuteToggle={() => setIsMuted(!isMuted)}
          />

          <ChillFocusControls
            isPaused={isPaused}
            onPauseToggle={handlePauseToggle}
            onExit={handleExitMode}
          />
        </div>
      </header>

      {/* Main Center Area */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-6 w-full max-w-5xl mx-auto space-y-6 z-10 text-center">
        {/* Mode Toggle */}
        <ChillFocusModeToggle mode={mode} onModeChange={handleModeToggle} />

        {/* Central Breathing Guide Visualizer */}
        <BreathingGuide isPaused={isPaused} reducedMotion={reducedMotion} />

        {/* AI Intervention Break Suggestion Bubble */}
        {showAiBubble && aiMessage && (
          <AiInterventionBubble
            message={aiMessage}
            onDismiss={() => setShowAiBubble(false)}
          />
        )}
      </main>

      {/* Bottom Area: Soundscape Selector */}
      <footer className="p-4 sm:p-6 w-full max-w-5xl mx-auto z-20">
        <SoundscapeSelector selectedId={soundscape} onSelect={handleSoundscapeSelect} />
      </footer>

      {/* Post-Session Summary Modal */}
      {showSummary && session && (
        <SessionSummary
          session={session}
          streak={streak}
          onClose={() => {
            setShowSummary(false);
            router.push('/study');
          }}
        />
      )}
    </ChillFocusShell>
  );
}
