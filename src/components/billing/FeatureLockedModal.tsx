'use client';

import React from 'react';
import Link from 'next/link';

interface FeatureLockedModalProps {
  isOpen: boolean;
  onClose: () => void;
  featureName: string;
  currentPlanCode?: string;
}

/**
 * Shown when EntitlementService.requireFeature() denies a request (only reachable once
 * BILLING_ENABLED=true and a route has opted into a requireFeature() check). Not currently
 * wired into any existing feature route — see the Phase 76 report for why that retrofit is
 * deferred rather than done in this pass.
 */
export function FeatureLockedModal({ isOpen, onClose, featureName, currentPlanCode }: FeatureLockedModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center px-4">
      <div className="bg-[#0a0e18] border border-[#424754] rounded-2xl p-6 max-w-sm w-full space-y-4 shadow-2xl text-center">
        <span className="text-3xl">🔒</span>
        <h3 className="text-sm font-extrabold text-[#dfe2f1]">This feature is available on a higher plan</h3>
        <p className="text-xs text-[#8c909f]">
          <span className="text-[#dfe2f1] font-semibold">{featureName}</span> is not included in your current plan
          {currentPlanCode ? ` (${currentPlanCode})` : ''}.
        </p>
        <div className="flex space-x-3 pt-2">
          <button
            onClick={onClose}
            className="flex-1 h-10 bg-[#0f131d] border border-[#424754] text-[#dfe2f1] text-xs font-bold rounded-xl"
          >
            Close
          </button>
          <Link
            href="/pricing"
            className="flex-1 h-10 flex items-center justify-center bg-gradient-to-r from-[#4d8eff] to-[#adc6ff] text-[#0a0e18] text-xs font-extrabold rounded-xl shadow-md hover:opacity-90"
          >
            View Plans
          </Link>
        </div>
      </div>
    </div>
  );
}
