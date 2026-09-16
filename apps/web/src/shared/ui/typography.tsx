import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentPropsWithoutRef, ElementType, JSX } from 'react';
import { cn } from './cn.js';

/**
 * The design sets every heading in the display face, solid, and uppercase.
 * `transform` exists because uppercase is a poor default for user-generated
 * content such as a listing title, which may be a street name.
 */
const headingStyles = cva('font-display', {
  variants: {
    tone: {
      default: 'text-text',
      /** Ink for a heading sitting on the lime accent, which stays lime on dark. */
      onAccent: 'text-on-accent',
    },
    size: {
      sm: 'text-lg leading-none',
      md: 'text-xl leading-none',
      lg: 'text-2xl leading-snug',
      xl: 'text-3xl leading-snug',
    },
    transform: {
      uppercase: 'uppercase',
      none: 'normal-case',
    },
  },
  defaultVariants: { tone: 'default', size: 'md', transform: 'uppercase' },
});

export interface HeadingProps
  extends Omit<ComponentPropsWithoutRef<'h2'>, 'color'>, VariantProps<typeof headingStyles> {
  /** Heading rank. Choose it for document structure, and `size` for appearance. */
  as?: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
}

export function Heading({
  as = 'h2',
  tone,
  size,
  transform,
  className,
  ...props
}: HeadingProps): JSX.Element {
  const Tag = as as ElementType;
  return <Tag className={cn(headingStyles({ tone, size, transform }), className)} {...props} />;
}

const textStyles = cva('font-body', {
  variants: {
    size: {
      xs: 'text-xs leading-normal',
      sm: 'text-sm leading-normal',
      base: 'text-base leading-normal',
      lg: 'text-lg leading-normal',
    },
    tone: {
      default: 'text-text-secondary',
      strong: 'text-text',
      muted: 'text-text-muted',
      accent: 'text-text',
      /** Ink for body copy sitting on the lime accent, which stays lime on dark. */
      onAccent: 'text-on-accent',
      danger: 'text-danger',
      success: 'text-success',
    },
    weight: {
      normal: 'font-normal',
      medium: 'font-medium',
      semibold: 'font-semibold',
    },
  },
  defaultVariants: { size: 'base', tone: 'default', weight: 'normal' },
});

export interface TextProps
  extends Omit<ComponentPropsWithoutRef<'p'>, 'color'>, VariantProps<typeof textStyles> {
  as?: 'p' | 'span' | 'div' | 'label' | 'li';
}

export function Text({
  as = 'p',
  size,
  tone,
  weight,
  className,
  ...props
}: TextProps): JSX.Element {
  const Tag = as as ElementType;
  return <Tag className={cn(textStyles({ size, tone, weight }), className)} {...props} />;
}
