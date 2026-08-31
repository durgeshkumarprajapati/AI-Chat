'use client';

import React from 'react';
import Link from 'next/link';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';

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
 *
 * Phase 77A: rebuilt on the shared Modal/Button (was hardcoded to a permanently-dark hex
 * palette with zero light-mode support) — same props, same behavior, now theme-correct.
 */
export function FeatureLockedModal({ isOpen, onClose, featureName, currentPlanCode }: FeatureLockedModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} maxWidthClassName="max-w-sm">
      <div className="text-center space-y-4">
        <span className="text-3xl">🔒</span>
        <h3 className="text-sm font-extrabold text-foreground">This feature is available on a higher plan</h3>
        <p className="text-xs text-muted-foreground">
          <span className="text-foreground font-semibold">{featureName}</span> is not included in your current plan
          {currentPlanCode ? ` (${currentPlanCode})` : ''}.
        </p>
        <div className="flex space-x-3 pt-2">
          <Button onClick={onClose} variant="secondary" className="flex-1">
            Close
          </Button>
          <Link href="/pricing" className="flex-1">
            <Button variant="primary" className="w-full">
              View Plans
            </Button>
          </Link>
        </div>
      </div>
    </Modal>
  );
}
