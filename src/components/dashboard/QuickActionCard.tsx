'use client';

import React from 'react';
import Link from 'next/link';

interface QuickActionCardProps {
  title: string;
  description: string;
  icon: string;
  href?: string;
  onClick?: () => void;
  accentColor: 'blue' | 'emerald' | 'amber' | 'purple';
  delayMs?: number;
}

export const QuickActionCard: React.FC<QuickActionCardProps> = ({
  title,
  description,
  icon,
  href,
  onClick,
  accentColor,
  delayMs = 0
}) => {
  const colorStyles = {
    blue: {
      iconBg: 'bg-[#4d8eff]/10 border-[#4d8eff]/30 text-[#4d8eff]',
      hoverBorder: 'hover:border-[#4d8eff]/60 hover:shadow-[#4d8eff]/10',
      titleHover: 'group-hover:text-[#adc6ff]'
    },
    emerald: {
      iconBg: 'bg-[#4edea3]/10 border-[#4edea3]/30 text-[#4edea3]',
      hoverBorder: 'hover:border-[#4edea3]/60 hover:shadow-[#4edea3]/10',
      titleHover: 'group-hover:text-[#4edea3]'
    },
    amber: {
      iconBg: 'bg-[#ffb95f]/10 border-[#ffb95f]/30 text-[#ffb95f]',
      hoverBorder: 'hover:border-[#ffb95f]/60 hover:shadow-[#ffb95f]/10',
      titleHover: 'group-hover:text-[#ffb95f]'
    },
    purple: {
      iconBg: 'bg-purple-500/10 border-purple-500/30 text-purple-400',
      hoverBorder: 'hover:border-purple-500/60 hover:shadow-purple-500/10',
      titleHover: 'group-hover:text-purple-300'
    }
  }[accentColor];

  const content = (
    <div
      className={`bg-[#0a0e18]/90 backdrop-blur-md border border-[#424754] rounded-2xl p-6 shadow-xl transition-all duration-300 hover:-translate-y-1 group flex flex-col justify-between h-full ${colorStyles.hoverBorder}`}
      style={{ animationDelay: `${delayMs}ms` }}
    >
      <div className="space-y-4">
        {/* Icon Container */}
        <div className={`w-11 h-11 rounded-xl border flex items-center justify-center text-lg font-bold transition-transform duration-300 group-hover:scale-105 ${colorStyles.iconBg}`}>
          {icon}
        </div>

        <div className="space-y-1">
          <h3 className={`text-sm font-extrabold text-[#dfe2f1] font-sans tracking-tight transition-colors ${colorStyles.titleHover}`}>
            {title}
          </h3>
          <p className="text-xs text-[#8c909f] leading-relaxed font-sans">
            {description}
          </p>
        </div>
      </div>

      <div className="pt-4 flex items-center text-xs font-bold text-[#adc6ff] space-x-1 group-hover:translate-x-1 transition-transform">
        <span>Open</span>
        <span>→</span>
      </div>
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block h-full font-sans">
        {content}
      </Link>
    );
  }

  return (
    <button type="button" onClick={onClick} className="block w-full h-full text-left font-sans">
      {content}
    </button>
  );
};
