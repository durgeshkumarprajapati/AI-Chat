'use client';

import React from 'react';

interface CitySelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeCity: string;
  popularCities: string[];
  manualCityInput: string;
  setManualCityInput: (_val: string) => void;
  onSelectCity: (_city: string) => void;
}

export const CitySelectionModal: React.FC<CitySelectionModalProps> = ({
  isOpen,
  onClose,
  activeCity,
  popularCities,
  manualCityInput,
  setManualCityInput,
  onSelectCity
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-[#0f131d]/80 backdrop-blur-md flex items-center justify-center p-4 font-sans select-none">
      <div className="bg-[#0a0e18] border border-[#424754] rounded-2xl p-6 max-w-md w-full space-y-5 shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#424754]/60 pb-3">
          <h3 className="text-sm font-bold text-[#dfe2f1]">Choose City Manually</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-[#8c909f] hover:text-[#dfe2f1] text-xs p-1 rounded-lg bg-[#0f131d] border border-[#424754]"
            aria-label="Close modal"
          >
            ✕
          </button>
        </div>

        <div className="space-y-4">
          <div className="space-y-1">
            <label className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#adc6ff]">
              SEARCH CITY
            </label>
            <input
              type="text"
              placeholder="Type city name (e.g. Vadodara)..."
              value={manualCityInput}
              onChange={(e) => setManualCityInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && manualCityInput.trim()) {
                  onSelectCity(manualCityInput.trim());
                }
              }}
              className="w-full bg-[#0f131d] border border-[#424754] rounded-xl px-3.5 py-2.5 text-xs text-[#dfe2f1] placeholder-[#8c909f] focus:outline-none focus:border-[#4d8eff] shadow-inner transition font-sans"
            />
          </div>

          <div className="space-y-2">
            <div className="text-[10px] font-mono text-[#8c909f] font-bold uppercase tracking-wider">
              POPULAR CITIES
            </div>
            <div className="flex flex-wrap gap-2">
              {popularCities.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => onSelectCity(c)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
                    activeCity === c
                      ? 'bg-gradient-to-r from-[#4d8eff] to-[#adc6ff] text-[#0a0e18] font-bold shadow-md shadow-[#4d8eff]/20'
                      : 'bg-[#0f131d] text-[#c2c6d6] hover:text-[#dfe2f1] border border-[#424754]'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
