'use client';

import React, { useEffect, useState, useRef } from 'react';
import { BreathingPhase, BreathingPreset } from '@/features/chill-focus/chill-focus.types';
import { DEFAULT_BREATHING_PRESET } from '@/features/chill-focus/chill-focus.constants';
import { ReducedMotionFallback } from './ReducedMotionFallback';

interface BreathingGuideProps {
  preset?: BreathingPreset;
  isPaused?: boolean;
  reducedMotion?: boolean;
}

export const BreathingGuide: React.FC<BreathingGuideProps> = ({
  preset,
  isPaused = false,
  reducedMotion = false
}) => {
  const safePreset: BreathingPreset = preset || DEFAULT_BREATHING_PRESET;

  const [phase, setPhase] = useState<BreathingPhase>('INHALE');
  const [secondsLeft, setSecondsLeft] = useState<number>(safePreset.inhaleSeconds);
  const [scale, setScale] = useState<number>(1.0);

  const animRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number | null>(null);

  // References to state for animation loop without re-subscribing
  const phaseRef = useRef<BreathingPhase>('INHALE');
  const phaseElapsedRef = useRef<number>(0);

  useEffect(() => {
    phaseRef.current = 'INHALE';
    phaseElapsedRef.current = 0;
    setPhase('INHALE');
    setSecondsLeft(safePreset.inhaleSeconds);
    setScale(1.0);
  }, [safePreset]);

  useEffect(() => {
    if (isPaused || reducedMotion) {
      if (animRef.current) cancelAnimationFrame(animRef.current);
      return;
    }

    lastTimeRef.current = performance.now();

    const updateLoop = (now: number) => {
      if (document.hidden) {
        // Skip animation loop when tab is backgrounded
        animRef.current = requestAnimationFrame(updateLoop);
        return;
      }

      const deltaSeconds = (now - (lastTimeRef.current || now)) / 1000;
      lastTimeRef.current = now;

      phaseElapsedRef.current += deltaSeconds;

      let currentPresetDuration = safePreset.inhaleSeconds;
      if (phaseRef.current === 'HOLD') currentPresetDuration = safePreset.holdSeconds;
      else if (phaseRef.current === 'EXHALE') currentPresetDuration = safePreset.exhaleSeconds;
      else if (phaseRef.current === 'REST') currentPresetDuration = safePreset.restSeconds;

      // Phase Transition Check
      if (phaseElapsedRef.current >= currentPresetDuration) {
        phaseElapsedRef.current = 0;
        if (phaseRef.current === 'INHALE') phaseRef.current = 'HOLD';
        else if (phaseRef.current === 'HOLD') phaseRef.current = 'EXHALE';
        else if (phaseRef.current === 'EXHALE') phaseRef.current = 'REST';
        else if (phaseRef.current === 'REST') phaseRef.current = 'INHALE';

        setPhase(phaseRef.current);
      }

      // Remaining Seconds Calculation
      let dur = safePreset.inhaleSeconds;
      if (phaseRef.current === 'HOLD') dur = safePreset.holdSeconds;
      else if (phaseRef.current === 'EXHALE') dur = safePreset.exhaleSeconds;
      else if (phaseRef.current === 'REST') dur = safePreset.restSeconds;

      const remaining = Math.max(1, Math.ceil(dur - phaseElapsedRef.current));
      setSecondsLeft(remaining);

      // Smooth Scale Interpolation (1.0 to 1.35)
      const progress = Math.min(1.0, Math.max(0.0, phaseElapsedRef.current / dur));
      let newScale = 1.0;

      if (phaseRef.current === 'INHALE') {
        newScale = 1.0 + progress * 0.35;
      } else if (phaseRef.current === 'HOLD') {
        newScale = 1.35;
      } else if (phaseRef.current === 'EXHALE') {
        newScale = 1.35 - progress * 0.35;
      } else {
        newScale = 1.0;
      }

      setScale(newScale);
      animRef.current = requestAnimationFrame(updateLoop);
    };

    animRef.current = requestAnimationFrame(updateLoop);

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [isPaused, reducedMotion, safePreset]);

  if (reducedMotion) {
    return <ReducedMotionFallback phase={phase} secondsLeft={secondsLeft} isPaused={isPaused} />;
  }

  const phaseLabels: Record<BreathingPhase, { title: string; icon: string; color: string }> = {
    INHALE: { title: 'Breathe In', icon: '💨', color: 'from-sky-400 to-indigo-400' },
    HOLD: { title: 'Hold', icon: '⏸', color: 'from-indigo-400 to-purple-400' },
    EXHALE: { title: 'Breathe Out', icon: '😮‍💨', color: 'from-purple-400 to-rose-400' },
    REST: { title: 'Rest', icon: '🍃', color: 'from-emerald-400 to-teal-400' }
  };

  const activeInfo = phaseLabels[phase];

  return (
    <div className="relative flex flex-col items-center justify-center my-6">
      {/* Outer Pulse Rings */}
      <div
        className="absolute rounded-full border border-sky-500/20 transition-all duration-300 pointer-events-none"
        style={{
          width: `${scale * 240}px`,
          height: `${scale * 240}px`
        }}
      />
      <div
        className="absolute rounded-full border border-indigo-500/10 transition-all duration-300 pointer-events-none"
        style={{
          width: `${scale * 280}px`,
          height: `${scale * 280}px`
        }}
      />

      {/* Main Breathing Visualizer Circle */}
      <div
        style={{
          transform: `scale(${scale})`,
          transition: 'transform 0.1s linear'
        }}
        className="w-52 h-52 sm:w-60 sm:h-60 rounded-full bg-gradient-to-b from-sky-900/60 to-indigo-950/80 border border-sky-500/30 backdrop-blur-md flex flex-col items-center justify-center space-y-2 shadow-2xl shadow-sky-500/20 relative z-10"
      >
        <div className="w-10 h-10 rounded-full bg-sky-500/20 flex items-center justify-center text-xl">
          {activeInfo.icon}
        </div>

        <div className="text-center space-y-0.5">
          <h2 className="text-lg sm:text-xl font-extrabold text-white tracking-tight">
            {activeInfo.title}
          </h2>
          <span className="text-xs font-mono font-semibold text-sky-300 block">
            {secondsLeft}s
          </span>
        </div>
      </div>
    </div>
  );
};
