import React from 'react';
import { BADGE_BASE, BADGE_VARIANTS } from '@/lib/design-system/theme.constants';

export type BadgeVariant = keyof typeof BADGE_VARIANTS;

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

/** Phase 77A shared Badge — semantic status color, correct in both themes (replaces ad hoc per-page status-color maps). */
export function Badge({ variant = 'neutral', className = '', children, ...props }: BadgeProps) {
  return (
    <span className={`${BADGE_BASE} ${BADGE_VARIANTS[variant]} ${className}`} {...props}>
      {children}
    </span>
  );
}
