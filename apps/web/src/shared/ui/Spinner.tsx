import type { JSX, SVGProps } from 'react';
import { cn } from './cn.js';

/**
 * Indeterminate progress mark. Decorative by default: callers that use it on
 * its own should label the surrounding region, and `Button` already sets
 * `aria-busy`. The spin stops under `prefers-reduced-motion`, which the base
 * stylesheet enforces globally.
 */
export function Spinner({ className, ...props }: SVGProps<SVGSVGElement>): JSX.Element {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      className={cn('size-4 animate-spin', className)}
      {...props}
    >
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
      <path
        d="M14.5 8A6.5 6.5 0 0 0 8 1.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
