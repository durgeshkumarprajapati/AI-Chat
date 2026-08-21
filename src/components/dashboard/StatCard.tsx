'use client';

import React, { useEffect, useState } from 'react';

interface StatCardProps {
  title: string;
  value: number;
  loading?: boolean;
  icon: string;
  accentColor: 'blue' | 'emerald' | 'amber';
  delayMs?: number;
}

export const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  loading = false,
  icon,
  accentColor,
  delayMs = 0
}) => {
  const [displayValue, setDisplayValue] = useState(0);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(true);
    }, delayMs);
    return () => clearTimeout(timer);
  }, [delayMs]);

  useEffect(() => {
    if (loading) return;

    let start = 0;
    const end = value;
    if (start === end) {
      setDisplayValue(end);
      return;
    }

    const duration = 800;
    const stepTime = Math.max(16, Math.floor(duration / Math.max(1, end)));

    const counterTimer = setInterval(() => {
      start += 1;
      setDisplayValue(start);
      if (start >= end) {
        setDisplayValue(end);
        clearInterval(counterTimer);
      }
    }, stepTime);

    return () => clearInterval(counterTimer);
  }, [value, loading]);

  const colorStyles = {
    blue: {
      bg: 'bg-[#4d8eff]/10 border-[#4d8eff]/30 text-[#4d8eff]',
      glow: 'hover:border-[#4d8eff]/60 hover:shadow-[#4d8eff]/10'
    },
    emerald: {
      bg: 'bg-[#4edea3]/10 border-[#4edea3]/30 text-[#4edea3]',
      glow: 'hover:border-[#4edea3]/60 hover:shadow-[#4edea3]/10'
    },
    amber: {
      bg: 'bg-[#ffb95f]/10 border-[#ffb95f]/30 text-[#ffb95f]',
      glow: 'hover:border-[#ffb95f]/60 hover:shadow-[#ffb95f]/10'
    }
  }[accentColor];

  return (
    <div
      className={`bg-[#0a0e18]/90 backdrop-blur-md border border-[#424754] rounded-2xl p-6 shadow-xl transition-all duration-500 hover:-translate-y-1 ${
        colorStyles.glow
      } ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}
      style={{ transitionDelay: `${delayMs}ms` }}
    >
      <div className="flex items-center justify-between mb-4">
        <div className={`w-12 h-12 rounded-xl border flex items-center justify-center text-xl font-bold ${colorStyles.bg}`}>
          {icon}
        </div>
        <span className="text-xs text-[#8c909f] font-mono">⋯</span>
      </div>

      <div className="space-y-1">
        <div className="text-3xl font-extrabold text-[#dfe2f1] font-sans tracking-tight">
          {loading ? '...' : displayValue}
        </div>
        <div className="text-xs font-semibold text-[#8c909f]">{title}</div>
      </div>
    </div>
  );
};
