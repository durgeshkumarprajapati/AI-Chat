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
    <div className="fixed inset-0 z-50 bg-slate-900/60 dark:bg-[#0f131d]/80 backdrop-blur-md flex items-center justify-center p-4 font-sans select-none">
      <div className="bg-white dark:bg-[#0a0e18] border border-slate-200 dark:border-[#424754] rounded-2xl p-6 max-w-md w-full space-y-5 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-[#424754]/60 pb-3">
          <h3 className="text-sm font-bold text-slate-900 dark:text-[#dfe2f1]">Choose City Manually</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-500 dark:text-[#8c909f] hover:text-slate-900 dark:hover:text-[#dfe2f1] text-xs p-1 rounded-lg bg-slate-100 dark:bg-[#0f131d] border border-slate-200 dark:border-[#424754]"
            aria-label="Close modal"
          >
            ✕
          </button>
        </div>

        <div className="space-y-4">
          <div className="space-y-1">
            <label className="text-[10px] font-mono font-bold uppercase tracking-wider text-indigo-600 dark:text-[#adc6ff]">
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
              className="w-full bg-slate-50 dark:bg-[#0f131d] border border-slate-300 dark:border-[#424754] rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-[#dfe2f1] placeholder-slate-400 dark:placeholder-[#8c909f] focus:outline-none focus:border-indigo-600 dark:focus:border-[#4d8eff] shadow-inner transition font-sans"
            />
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-500 dark:text-[#8c909f]">
              POPULAR CITIES
            </label>
            <div className="flex flex-wrap gap-2">
              {popularCities.map((city) => {
                const isSelected = city === activeCity;
                return (
                  <button
                    key={city}
                    type="button"
                    onClick={() => onSelectCity(city)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
                      isSelected
                        ? 'bg-indigo-600 dark:bg-[#4d8eff] text-white dark:text-[#0a0e18] shadow-md shadow-indigo-600/20 dark:shadow-[#4d8eff]/20 font-extrabold'
                        : 'bg-slate-100 dark:bg-[#0f131d] text-slate-700 dark:text-[#c2c6d6] border border-slate-200 dark:border-[#424754] hover:border-indigo-400 dark:hover:border-[#4d8eff] hover:text-slate-900 dark:hover:text-[#dfe2f1]'
                    }`}
                  >
                    📍 {city}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="pt-2 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-100 dark:bg-[#0f131d] hover:bg-slate-200 dark:hover:bg-[#141926] text-slate-700 dark:text-[#dfe2f1] border border-slate-300 dark:border-[#424754] rounded-xl text-xs font-semibold transition"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};
