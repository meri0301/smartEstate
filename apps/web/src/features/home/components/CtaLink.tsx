import type { JSX, ReactNode } from 'react';
import { Link } from 'react-router';
import { cn } from '../../../shared/ui/index.js';

export interface CtaLinkProps {
  /** Path relative to the locale segment, which the router supplies. */
  to: string;
  size?: 'md' | 'lg';
  className?: string;
  children: ReactNode;
}

/**
 * The lime pill the design uses for both calls to action.
 *
 * A link wearing the primary button's clothes rather than a button that
 * navigates, because it goes somewhere: it should open in a new tab on a middle
 * click and offer the browser's own link menu. It is written here rather than
 * reusing `Button` because `Button` renders a `<button>`, and an anchor styled
 * as one is the accessible way round.
 */
export function CtaLink({ to, size = 'md', className, children }: CtaLinkProps): JSX.Element {
  return (
    <Link
      to={to}
      className={cn(
        'inline-flex items-center justify-center rounded-full bg-accent font-body font-semibold text-on-accent',
        'transition-colors duration-[var(--se-duration-fast)] ease-standard',
        'hover:bg-accent-hover active:bg-accent-active',
        size === 'lg' ? 'h-control-lg px-8 text-base' : 'h-control px-6 text-base',
        className,
      )}
    >
      {children}
    </Link>
  );
}
