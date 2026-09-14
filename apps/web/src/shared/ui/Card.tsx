import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentPropsWithoutRef, ElementType, JSX } from 'react';
import { cn } from './cn.js';

/**
 * The design separates surfaces with a hairline and a generous radius, never a
 * shadow, so `elevated` exists only for layers that genuinely float.
 */
const cardStyles = cva('rounded-md', {
  variants: {
    tone: {
      surface: 'bg-surface border border-border',
      muted: 'bg-surface-muted',
      accent: 'bg-accent-subtle',
      outline: 'bg-transparent border border-border',
    },
    padding: {
      none: 'p-0',
      sm: 'p-4',
      md: 'p-6',
      lg: 'p-8',
    },
    elevated: {
      true: 'shadow-overlay',
      false: '',
    },
  },
  defaultVariants: { tone: 'surface', padding: 'md', elevated: false },
});

export interface CardProps
  extends Omit<ComponentPropsWithoutRef<'div'>, 'color'>, VariantProps<typeof cardStyles> {
  as?: 'div' | 'article' | 'section' | 'li';
}

export function Card({
  as = 'div',
  tone,
  padding,
  elevated,
  className,
  ...props
}: CardProps): JSX.Element {
  const Tag = as as ElementType;
  return <Tag className={cn(cardStyles({ tone, padding, elevated }), className)} {...props} />;
}

export function CardHeader({ className, ...props }: ComponentPropsWithoutRef<'div'>): JSX.Element {
  return <div className={cn('mb-4 flex flex-col gap-2', className)} {...props} />;
}

export function CardBody({ className, ...props }: ComponentPropsWithoutRef<'div'>): JSX.Element {
  return <div className={cn('flex flex-col gap-3', className)} {...props} />;
}

export function CardFooter({ className, ...props }: ComponentPropsWithoutRef<'div'>): JSX.Element {
  return <div className={cn('mt-6 flex flex-wrap items-center gap-3', className)} {...props} />;
}
