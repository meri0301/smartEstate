import type { JSX, ReactNode } from 'react';
import { Link } from 'react-router';
import { cn } from '../../../shared/ui/index.js';

interface CtaLinkBaseProps {
  size?: 'md' | 'lg';
  className?: string;
  children: ReactNode;
}

export type CtaLinkProps = CtaLinkBaseProps &
  (
    | {
        /** Path relative to the locale segment, which the router supplies. */
        to: string;
        href?: never;
      }
    | {
        /** An anchor within the current page; routed navigation would lose it. */
        href: string;
        to?: never;
      }
  );

const STYLE = [
  'inline-flex items-center justify-center rounded-full bg-accent font-body font-semibold text-on-accent',
  'transition-colors duration-[var(--se-duration-fast)] ease-standard',
  'hover:bg-accent-hover active:bg-accent-active',
];

/**
 * The lime pill the design uses for both calls to action.
 *
 * A link wearing the primary button's clothes rather than a button that
 * navigates, because it goes somewhere: it should open in a new tab on a middle
 * click and offer the browser's own link menu. It is written here rather than
 * reusing `Button` because `Button` renders a `<button>`, and an anchor styled
 * as one is the accessible way round.
 *
 * Two destinations, because the page has two kinds. `to` is a route and goes
 * through the router; `href` is a fragment on this page and must not, since the
 * router would treat it as a path and navigate away from the section it names.
 */
export function CtaLink({ to, href, size = 'md', className, children }: CtaLinkProps): JSX.Element {
  const classes = cn(
    STYLE,
    size === 'lg' ? 'h-control-lg px-8 text-base' : 'h-control px-6 text-base',
    className,
  );

  if (href !== undefined) {
    return (
      <a href={href} className={classes}>
        {children}
      </a>
    );
  }

  return (
    <Link to={to} className={classes}>
      {children}
    </Link>
  );
}
