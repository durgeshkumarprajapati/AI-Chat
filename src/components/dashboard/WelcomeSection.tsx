'use client';

import React from 'react';

interface WelcomeSectionProps {
  userName: string;
  activeCity: string;
  activeRegion: string;
  locationStatus: 'loading' | 'prompt' | 'granted' | 'denied';
  onRequestGeolocation: () => void;
  onChangeCityClick: () => void;
}

export const WelcomeSection: React.FC<WelcomeSectionProps> = ({
  userName,
  activeCity,
  activeRegion,
  locationStatus,
  onRequestGeolocation,
  onChangeCityClick
}) => {
  return (
    <div className="space-y-3 font-sans">
      <div className="flex items-center space-x-3 flex-wrap gap-y-2">
        <h1 className="text-2xl sm:text-3xl font-extrabold text-[#dfe2f1] tracking-tight">
          Welcome, {userName} 👋
        </h1>
        <span className="px-2.5 py-0.5 rounded-full bg-[#4d8eff]/15 text-[#adc6ff] border border-[#4d8eff]/30 text-[10px] font-mono font-bold uppercase tracking-wider">
          Enterprise Workspace
        </span>
      </div>

      <div className="flex items-center space-x-3 text-xs text-[#c2c6d6] flex-wrap gap-2">
        <span className="flex items-center space-x-1.5 font-medium">
          <span>📍</span>
          <span className="text-[#dfe2f1] font-semibold">{activeCity}, {activeRegion}</span>
        </span>

        <button
          type="button"
          onClick={onChangeCityClick}
          className="text-[11px] text-[#4d8eff] hover:text-[#adc6ff] font-semibold underline underline-offset-4 transition"
        >
          Change City
        </button>
      </div>

      {/* Location Permission Callout */}
      {locationStatus === 'prompt' && (
        <div className="p-3 rounded-2xl bg-[#0a0e18] border border-[#424754] text-xs flex flex-wrap items-center justify-between gap-3 shadow-lg max-w-xl">
          <span className="text-[#8c909f] flex items-center space-x-1.5">
            <span>🌐</span>
            <span>Enable location to personalize city intelligence and weather.</span>
          </span>
          <button
            type="button"
            onClick={onRequestGeolocation}
            className="px-3 py-1.5 bg-gradient-to-r from-[#4d8eff] to-[#adc6ff] text-[#0a0e18] rounded-xl text-xs font-bold transition hover:opacity-90 shadow-md shadow-[#4d8eff]/20 whitespace-nowrap"
          >
            Use My Location
          </button>
        </div>
      )}

      {locationStatus === 'denied' && (
        <p className="text-[11px] text-[#ffb95f] font-mono">
          ℹ️ Using manual location preference ({activeCity}).
        </p>
      )}
    </div>
  );
};
