'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { tourRegistry } from '../tour-registry';
import { TourDefinition, TourStepDefinition, TourStatus } from '../tour-types';
import { tourAnalyticsService } from '../tour-analytics.service';

export interface TourContextValue {
  isOpen: boolean;
  activeTour: TourDefinition;
  currentStepIndex: number;
  currentStep: TourStepDefinition | null;
  targetMissing: boolean;
  startTour: (_tourId?: string) => void;
  restartTour: () => void;
  skipTour: () => void;
  closeTour: () => void;
  nextStep: () => void;
  prevStep: () => void;
  goToStep: (_index: number) => void;
}

const TourContext = createContext<TourContextValue | null>(null);

export function TourProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || '/';
  const [isOpen, setIsOpen] = useState(false);
  const [activeTour, setActiveTour] = useState<TourDefinition>(() => tourRegistry.getTourForRoute(pathname));
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [targetMissing, setTargetMissing] = useState(false);

  // Sync active tour when pathname changes
  useEffect(() => {
    const resolved = tourRegistry.getTourForRoute(pathname);
    setActiveTour(resolved);
  }, [pathname]);

  const currentStep = activeTour.steps[currentStepIndex] || null;

  // Persist tour progress to backend API & LocalStorage
  const persistProgress = useCallback(async (tourId: string, version: number, status: TourStatus, step: number) => {
    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem(`docai_tour_${tourId}_status`, status);
        localStorage.setItem(`docai_tour_${tourId}_step`, String(step));
        localStorage.setItem(`docai_tour_${tourId}_version`, String(version));
      }

      await fetch('/api/tours/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tourId,
          tourVersion: version,
          status,
          currentStep: step
        })
      });
    } catch (err) {
      console.warn('[TourProvider] Progress save failed:', err);
    }
  }, []);

  const startTour = useCallback((tourId?: string) => {
    const targetTour = tourId ? (tourRegistry.getTourById(tourId) || activeTour) : activeTour;
    setActiveTour(targetTour);
    setCurrentStepIndex(0);
    setIsOpen(true);
    setTargetMissing(false);

    tourAnalyticsService.logEvent('tour.started', targetTour.id, targetTour.version, targetTour.steps[0]?.id, 0, targetTour.steps[0]?.target);
    persistProgress(targetTour.id, targetTour.version, 'IN_PROGRESS', 0);
  }, [activeTour, persistProgress]);

  const restartTour = useCallback(() => {
    startTour(activeTour.id);
  }, [activeTour.id, startTour]);

  const skipTour = useCallback(() => {
    setIsOpen(false);
    tourAnalyticsService.logEvent('tour.skipped', activeTour.id, activeTour.version, currentStep?.id, currentStepIndex);
    persistProgress(activeTour.id, activeTour.version, 'SKIPPED', currentStepIndex);
  }, [activeTour.id, activeTour.version, currentStep?.id, currentStepIndex, persistProgress]);

  const closeTour = useCallback(() => {
    setIsOpen(false);
    tourAnalyticsService.logEvent('tour.dismissed', activeTour.id, activeTour.version, currentStep?.id, currentStepIndex);
  }, [activeTour.id, activeTour.version, currentStep?.id, currentStepIndex]);

  const nextStep = useCallback(() => {
    if (currentStepIndex >= activeTour.steps.length - 1) {
      setIsOpen(false);
      tourAnalyticsService.logEvent('tour.completed', activeTour.id, activeTour.version, currentStep?.id, currentStepIndex);
      persistProgress(activeTour.id, activeTour.version, 'COMPLETED', currentStepIndex);
    } else {
      const nextIdx = currentStepIndex + 1;
      setCurrentStepIndex(nextIdx);
      const nextS = activeTour.steps[nextIdx];
      tourAnalyticsService.logEvent('tour.step_completed', activeTour.id, activeTour.version, nextS?.id, nextIdx, nextS?.target);
      persistProgress(activeTour.id, activeTour.version, 'IN_PROGRESS', nextIdx);
    }
  }, [activeTour, currentStep?.id, currentStepIndex, persistProgress]);

  const prevStep = useCallback(() => {
    if (currentStepIndex > 0) {
      const prevIdx = currentStepIndex - 1;
      setCurrentStepIndex(prevIdx);
      const prevS = activeTour.steps[prevIdx];
      tourAnalyticsService.logEvent('tour.step_viewed', activeTour.id, activeTour.version, prevS?.id, prevIdx, prevS?.target);
    }
  }, [activeTour, currentStepIndex]);

  const goToStep = useCallback((index: number) => {
    if (index >= 0 && index < activeTour.steps.length) {
      setCurrentStepIndex(index);
    }
  }, [activeTour.steps.length]);

  return (
    <TourContext.Provider
      value={{
        isOpen,
        activeTour,
        currentStepIndex,
        currentStep,
        targetMissing,
        startTour,
        restartTour,
        skipTour,
        closeTour,
        nextStep,
        prevStep,
        goToStep
      }}
    >
      {children}
    </TourContext.Provider>
  );
}

export function useTour() {
  const ctx = useContext(TourContext);
  if (!ctx) {
    throw new Error('useTour must be used within a TourProvider');
  }
  return ctx;
}
