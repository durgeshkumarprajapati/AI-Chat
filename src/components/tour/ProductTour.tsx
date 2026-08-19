'use client';

import React, { useEffect, useState } from 'react';
import { useTour } from '@/features/tours/components/TourProvider';
import { TourProgress } from '@/features/tours/components/TourProgress';
import { TourControls } from '@/features/tours/components/TourControls';

export function ProductTour({ legacyIsOpen, legacyOnClose }: { legacyIsOpen?: boolean; legacyOnClose?: () => void }) {
  const {
    isOpen: contextIsOpen,
    activeTour,
    currentStepIndex,
    currentStep,
    nextStep,
    prevStep,
    skipTour,
    closeTour,
    goToStep
  } = useTour();

  const isOpen = legacyIsOpen !== undefined ? legacyIsOpen : contextIsOpen;
  const handleClose = legacyOnClose || closeTour;

  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [targetFound, setTargetFound] = useState<boolean>(true);

  // Target Element Resolution with wait budget & polling
  useEffect(() => {
    if (!isOpen || !currentStep) {
      setTargetRect(null);
      setTargetFound(true);
      return;
    }

    let isMounted = true;
    let attempts = 0;
    const maxAttempts = 10;
    const intervalMs = 200;

    const findTarget = () => {
      const selector = currentStep.target;
      let el: Element | null = null;

      if (selector.startsWith('data-tour=')) {
        const attrVal = selector.replace('data-tour="', '').replace('"', '');
        el = document.querySelector(`[data-tour="${attrVal}"]`);
      } else {
        try {
          el = document.querySelector(selector);
        } catch {}
      }

      if (el) {
        const rect = el.getBoundingClientRect();
        if (isMounted) {
          setTargetRect(rect);
          setTargetFound(true);
        }
      } else {
        attempts++;
        if (attempts < maxAttempts) {
          setTimeout(findTarget, intervalMs);
        } else if (isMounted) {
          setTargetRect(null);
          setTargetFound(false);
        }
      }
    };

    findTarget();

    return () => {
      isMounted = false;
    };
  }, [isOpen, currentStep]);

  // Keyboard navigation shortcuts
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
      } else if (e.key === 'ArrowRight') {
        nextStep();
      } else if (e.key === 'ArrowLeft') {
        prevStep();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleClose, nextStep, prevStep]);

  if (!isOpen || !currentStep) return null;

  const totalSteps = activeTour.steps.length;
  const isFirst = currentStepIndex === 0;
  const isLast = currentStepIndex === totalSteps - 1;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tour-step-title"
      aria-describedby="tour-step-description"
    >
      {/* Target Element Spotlight Overlay Cutout */}
      {targetRect && targetFound && (
        <div
          className="fixed pointer-events-none rounded-xl border-2 border-indigo-400 shadow-[0_0_30px_rgba(99,102,241,0.5)] transition-all duration-300 z-50"
          style={{
            top: Math.max(0, targetRect.top - 6),
            left: Math.max(0, targetRect.left - 6),
            width: targetRect.width + 12,
            height: targetRect.height + 12
          }}
        />
      )}

      {/* Main Tour Card Dialog */}
      <div className="relative w-full max-w-lg rounded-2xl bg-slate-900 border border-slate-800 p-6 shadow-2xl space-y-5 text-slate-100 z-50">
        {/* Step Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3.5">
          <div className="flex items-center space-x-3">
            <span className="text-2xl">{currentStep.icon || '✨'}</span>
            <div>
              <div className="flex items-center space-x-2">
                <h3 id="tour-step-title" className="text-lg font-bold text-white tracking-tight">
                  {currentStep.title}
                </h3>
                {activeTour.badge && (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-800">
                    {activeTour.badge}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400">
                Step {currentStepIndex + 1} of {totalSteps} • {activeTour.module}
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="text-slate-400 hover:text-white text-xs font-semibold p-1 rounded-lg hover:bg-slate-800 transition"
            aria-label="Close tour"
          >
            ✕
          </button>
        </div>

        {/* Step Content */}
        <div className="space-y-3 py-1">
          {!targetFound && (
            <div className="p-3 rounded-xl bg-amber-950/60 border border-amber-800/60 text-amber-300 text-xs">
              ⚠️ {currentStep.emptyStateExplanation || 'This feature step is not currently visible on screen.'}
            </div>
          )}

          <p id="tour-step-description" className="text-sm text-slate-200 leading-relaxed">
            {currentStep.description}
          </p>

          {currentStep.technicalDetails && (
            <div className="rounded-xl bg-slate-950 border border-slate-800 p-3 space-y-1">
              <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider">Under The Hood</span>
              <p className="text-xs font-mono text-slate-300">{currentStep.technicalDetails}</p>
            </div>
          )}
        </div>

        {/* Progress Indicator */}
        <TourProgress currentStep={currentStepIndex} totalSteps={totalSteps} onSelectStep={goToStep} />

        {/* Action Controls */}
        <TourControls
          isFirst={isFirst}
          isLast={isLast}
          onPrev={prevStep}
          onNext={nextStep}
          onSkip={skipTour}
        />
      </div>
    </div>
  );
}
