import React from 'react';
import { SURFACE, TRANSITION } from '@/lib/design-system/theme.constants';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  interactive?: boolean;
}

/** Phase 77A shared Card — correct light/dark background+border for free; opt into hover/elevation via `interactive`. */
export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ interactive = false, className = '', children, ...props }, ref) => (
    <div
      ref={ref}
      className={`${SURFACE.card} rounded-2xl p-6 shadow-sm ${TRANSITION.elevate} ${interactive ? `${SURFACE.cardHover} cursor-pointer` : ''} ${className}`}
      {...props}
    >
      {children}
    </div>
  )
);
Card.displayName = 'Card';

export function CardHeader({ className = '', children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`flex items-center justify-between border-b border-border pb-3 mb-4 ${className}`} {...props}>
      {children}
    </div>
  );
}

export function CardTitle({ className = '', children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3 className={`text-sm font-semibold text-foreground ${className}`} {...props}>
      {children}
    </h3>
  );
}
