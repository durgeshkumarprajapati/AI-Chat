'use client';

import React, { useEffect, useState } from 'react';
import { VoiceState } from '@/features/voice-tutor/voice-tutor.types';
import { VOICE_STATE_DESCRIPTIONS } from '@/features/voice-tutor/voice-tutor.constants';

interface VoiceOrbProps {
  state: VoiceState;
  disabled?: boolean;
  onClick?: () => void;
  size?: 'sm' | 'md' | 'lg';
}

export const VoiceOrb: React.FC<VoiceOrbProps> = ({
  state,
  disabled = false,
  onClick,
  size = 'md'
}) => {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(motionQuery.matches);
  }, []);

  const sizeClasses = {
    sm: 'w-24 h-24 text-3xl',
    md: 'w-32 h-32 sm:w-40 sm:h-40 text-4xl sm:text-5xl',
    lg: 'w-40 h-40 sm:w-48 sm:h-48 text-5xl sm:text-6xl'
  }[size];

  const ringSizes = {
    sm: { outer: 'w-32 h-32', inner: 'w-28 h-28' },
    md: { outer: 'w-48 h-48 sm:w-56 sm:h-56', inner: 'w-40 h-40 sm:w-48 sm:h-48' },
    lg: { outer: 'w-56 h-56 sm:w-64 sm:h-64', inner: 'w-48 h-48 sm:w-56 sm:h-56' }
  }[size];

  // Visual configuration mapping based on state
  const stateConfig: Record<
    VoiceState,
    {
      icon: string;
      gradient: string;
      glow: string;
      pulseRing: string;
      statusText: string;
      animationClass: string;
    }
  > = {
    IDLE: {
      icon: '🎙️',
      gradient: 'from-[#4d8eff] via-indigo-600 to-indigo-900',
      glow: 'shadow-[#4d8eff]/30 border-[#adc6ff]/60',
      pulseRing: 'border-[#4d8eff]/20',
      statusText: 'Ready to learn',
      animationClass: reducedMotion ? '' : 'animate-pulse'
    },
    LISTENING: {
      icon: '⏹️',
      gradient: 'from-rose-500 via-rose-600 to-rose-900',
      glow: 'shadow-rose-500/50 border-rose-300 scale-105',
      pulseRing: 'border-rose-500/40 bg-rose-500/10',
      statusText: 'Listening...',
      animationClass: reducedMotion ? '' : 'animate-ping'
    },
    PROCESSING: {
      icon: '⚙️',
      gradient: 'from-indigo-600 via-purple-600 to-indigo-950',
      glow: 'shadow-indigo-500/40 border-indigo-400',
      pulseRing: 'border-indigo-500/30',
      statusText: 'Processing audio...',
      animationClass: reducedMotion ? '' : 'animate-spin'
    },
    THINKING: {
      icon: '🧠',
      gradient: 'from-purple-600 via-indigo-600 to-slate-900',
      glow: 'shadow-purple-500/40 border-purple-400',
      pulseRing: 'border-purple-500/30',
      statusText: 'Thinking...',
      animationClass: reducedMotion ? '' : 'animate-pulse'
    },
    SPEAKING: {
      icon: '🔊',
      gradient: 'from-emerald-500 via-teal-600 to-emerald-950',
      glow: 'shadow-emerald-500/40 border-emerald-300 scale-105',
      pulseRing: 'border-emerald-500/30 bg-emerald-500/10',
      statusText: 'AI is speaking...',
      animationClass: reducedMotion ? '' : 'animate-bounce'
    },
    PAUSED: {
      icon: '⏸️',
      gradient: 'from-slate-700 via-slate-800 to-slate-950',
      glow: 'shadow-slate-700/20 border-slate-600',
      pulseRing: 'border-slate-700/20',
      statusText: 'Session Paused',
      animationClass: ''
    },
    ERROR: {
      icon: '⚠️',
      gradient: 'from-amber-600 via-rose-700 to-rose-950',
      glow: 'shadow-amber-500/40 border-amber-400',
      pulseRing: 'border-amber-500/30',
      statusText: 'Something went wrong',
      animationClass: ''
    },
    ENDED: {
      icon: '✓',
      gradient: 'from-[#00a572] via-slate-800 to-slate-950',
      glow: 'shadow-emerald-500/20 border-emerald-500/40',
      pulseRing: 'border-emerald-500/20',
      statusText: 'Session Completed',
      animationClass: ''
    }
  };

  const current = stateConfig[state] || stateConfig.IDLE;

  return (
    <div className="flex flex-col items-center justify-center space-y-3 font-sans select-none">
      {/* Visual Concentric Glowing Rings */}
      <div className="relative flex items-center justify-center my-2">
        {/* Outer Glow Ring */}
        <div
          className={`absolute rounded-full border transition-all duration-700 pointer-events-none ${ringSizes.outer} ${current.pulseRing} ${current.animationClass}`}
        />

        {/* Inner Pulse Ring */}
        <div
          className={`absolute rounded-full border transition-all duration-500 pointer-events-none ${ringSizes.inner} ${current.pulseRing}`}
        />

        {/* Main Central Orb Button */}
        <button
          type="button"
          onClick={onClick}
          disabled={disabled || state === 'PROCESSING'}
          aria-label={
            state === 'LISTENING'
              ? 'Stop recording speech'
              : state === 'SPEAKING'
              ? 'Interrupt AI speech and talk'
              : 'Click microphone to start voice learning session'
          }
          className={`relative z-10 rounded-full bg-gradient-to-br ${current.gradient} border-4 ${current.glow} flex items-center justify-center transition-all duration-300 shadow-2xl active:scale-95 hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed ${sizeClasses}`}
        >
          <span className="drop-shadow-lg">{current.icon}</span>
        </button>
      </div>

      {/* State Label Text */}
      <div className="text-center space-y-0.5 max-w-xs">
        <h3 className="text-sm font-bold text-[#dfe2f1] tracking-tight">
          {current.statusText}
        </h3>
        <p className="text-[11px] font-mono text-[#c2c6d6]">
          {VOICE_STATE_DESCRIPTIONS[state] || VOICE_STATE_DESCRIPTIONS.IDLE}
        </p>
      </div>
    </div>
  );
};
