import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentPropsWithoutRef, JSX } from 'react';
import { cn } from './cn.js';

const skeletonStyles = cva('animate-pulse bg-surface-muted', {
  variants: {
    shape: {
      text: 'h-4 rounded-xs',
      heading: 'h-6 rounded-xs',
      rect: 'rounded-sm',
      card: 'rounded-md',
      circle: 'rounded-full',
    },
  },
  defaultVariants: { shape: 'text' },
});

export interface SkeletonProps
  extends ComponentPropsWithoutRef<'div'>, VariantProps<typeof skeletonStyles> {}

/**
 * Loading placeholder. Hidden from assistive technology: the region that is
 * loading should carry `aria-busy`, so announcing the placeholders themselves
 * would only add noise. The pulse stops under `prefers-reduced-motion`.
 */
export function Skeleton({ shape, className, ...props }: SkeletonProps): JSX.Element {
  return <div aria-hidden className={cn(skeletonStyles({ shape }), className)} {...props} />;
}

export interface SkeletonTextProps extends ComponentPropsWithoutRef<'div'> {
  /** Number of placeholder lines; the last one is shortened to look like prose. */
  lines?: number;
}

export function SkeletonText({ lines = 3, className, ...props }: SkeletonTextProps): JSX.Element {
  return (
    <div className={cn('flex flex-col gap-2', className)} {...props}>
      {Array.from({ length: lines }, (_, index) => (
        <Skeleton key={index} shape="text" className={index === lines - 1 ? 'w-3/5' : 'w-full'} />
      ))}
    </div>
  );
}
