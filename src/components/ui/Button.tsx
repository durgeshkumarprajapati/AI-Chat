'use client';

import React from 'react';
import { BUTTON_VARIANTS, BUTTON_SIZES } from '@/lib/design-system/theme.constants';

export type ButtonVariant = keyof typeof BUTTON_VARIANTS;
export type ButtonSize = keyof typeof BUTTON_SIZES;

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

/**
 * Phase 77A — the first shared component in this codebase (previously every page hand-rolled
 * its own button className). New pages get correct light/dark/hover/focus/disabled styling for
 * free; existing hand-rolled buttons are left as-is (see the phase report for which pages were
 * retrofitted to use this vs. which keep their own markup).
 */
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', loading = false, disabled, className = '', children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={`${BUTTON_VARIANTS[variant]} ${BUTTON_SIZES[size]} ${className}`}
        {...props}
      >
        {loading && (
          <span className="h-3.5 w-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" aria-hidden="true" />
        )}
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';
