import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentPropsWithoutRef, JSX } from 'react';
import { cn } from './cn.js';

/**
 * Status pill. Every tone pairs a subtle background with ink that clears AA
 * against it; the token tests assert those ratios, so a new tone cannot be
 * added without meeting them.
 */
const badgeStyles = cva(
  'inline-flex items-center gap-1.5 rounded-full font-body font-medium whitespace-nowrap',
  {
    variants: {
      tone: {
        neutral: 'bg-surface-muted text-text-secondary',
        accent: 'bg-accent-subtle text-text',
        success: 'bg-success-subtle text-success',
        warning: 'bg-warning-subtle text-warning',
        danger: 'bg-danger-subtle text-danger',
        info: 'bg-info-subtle text-info',
      },
      size: {
        sm: 'px-2 py-px text-xs',
        md: 'px-3 py-1 text-sm',
      },
    },
    defaultVariants: { tone: 'neutral', size: 'md' },
  },
);

export interface BadgeProps
  extends Omit<ComponentPropsWithoutRef<'span'>, 'color'>, VariantProps<typeof badgeStyles> {
  /**
   * Text announced instead of the visible content, for badges whose meaning is
   * carried by colour or an abbreviation.
   */
  srLabel?: string;
}

export function Badge({
  tone,
  size,
  className,
  srLabel,
  children,
  ...props
}: BadgeProps): JSX.Element {
  return (
    <span className={cn(badgeStyles({ tone, size }), className)} {...props}>
      {srLabel !== undefined && <span className="sr-only">{srLabel}</span>}
      <span aria-hidden={srLabel !== undefined || undefined}>{children}</span>
    </span>
  );
}
