'use client';

import React from 'react';
import { SURFACE } from '@/lib/design-system/theme.constants';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  maxWidthClassName?: string;
}

/** Phase 77A shared Modal — matches the overlay/panel/close-button convention already used by CitySelectionModal, now token-driven so it's correct in both themes automatically. */
export function Modal({ isOpen, onClose, title, children, maxWidthClassName = 'max-w-md' }: ModalProps) {
  if (!isOpen) return null;

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 ${SURFACE.modalOverlay} animate-fade-in`}>
      <div className={`${SURFACE.modalPanel} rounded-2xl p-6 w-full ${maxWidthClassName} space-y-5`}>
        {title && (
          <div className="flex items-center justify-between border-b border-border pb-3">
            <h3 className="text-sm font-extrabold text-foreground">{title}</h3>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="text-muted-foreground hover:text-foreground text-xs p-1 rounded-lg bg-muted border border-border transition-colors duration-150"
            >
              ✕
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
