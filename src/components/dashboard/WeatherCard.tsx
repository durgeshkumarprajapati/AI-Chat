'use client';

import React from 'react';

interface WeatherCardProps {
  activeCity: string;
  weather?: {
    temperature: number;
    condition: string;
    feelsLike?: number;
    high?: number;
    low?: number;
  } | null;
  onExploreClick: () => void;
}

export const WeatherCard: React.FC<WeatherCardProps> = ({
  activeCity,
  weather,
  onExploreClick
}) => {
  const temp = weather ? `${weather.temperature}°C` : '32°C';
  const condition = weather?.condition || 'Partly Cloudy';
  const feels = weather?.feelsLike || 30;

  return (
    <div className="bg-[#0a0e18]/90 backdrop-blur-md border border-[#424754] p-4 sm:p-5 rounded-2xl shadow-xl flex items-center justify-between gap-6 font-sans hover:border-[#4d8eff]/60 transition-all duration-300">
      <div className="space-y-1">
        <div className="flex items-center space-x-2.5">
          <span className="text-2xl">☀️</span>
          <span className="text-2xl font-extrabold text-[#dfe2f1] font-sans tracking-tight">{temp}</span>
          <span className="text-xs font-semibold text-[#adc6ff] bg-[#4d8eff]/10 px-2 py-0.5 rounded-full border border-[#4d8eff]/30">
            {condition}
          </span>
        </div>
        <div className="text-[11px] text-[#8c909f] font-mono">
          Feels like {feels}°C • Spatial City Weather
        </div>
      </div>

      <button
        type="button"
        onClick={onExploreClick}
        className="px-4 py-2.5 bg-gradient-to-r from-[#4d8eff] to-[#adc6ff] hover:opacity-90 text-[#0a0e18] font-bold text-xs rounded-xl shadow-lg shadow-[#4d8eff]/20 transition flex items-center space-x-1.5 whitespace-nowrap"
      >
        <span>Explore {activeCity}</span>
        <span>→</span>
      </button>
    </div>
  );
};
