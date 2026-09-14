import { cva, type VariantProps } from 'class-variance-authority';
import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from 'react';
import { cn } from './cn.js';
import { Spinner } from './Spinner.js';

/**
 * The design draws one button: a lime pill with dark ink, plus a dark pill for
 * the closing call to action. The remaining variants are the minimum an
 * application needs and are built from the same tokens.
 */
const buttonStyles = cva(
  [
    'inline-flex items-center justify-center gap-2 rounded-full',
    'font-body font-semibold whitespace-nowrap',
    // Tailwind has no named-duration namespace, so the token is referenced directly.
    'transition-colors duration-[var(--se-duration-fast)] ease-standard',
    'disabled:pointer-events-none disabled:opacity-50',
  ],
  {
    variants: {
      variant: {
        primary: 'bg-accent text-on-accent hover:bg-accent-hover active:bg-accent-active',
        inverse: 'bg-inverse text-on-inverse hover:opacity-90 active:opacity-80',
        outline:
          'border border-border-interactive bg-transparent text-text hover:bg-surface-muted active:bg-surface-muted',
        ghost: 'bg-transparent text-text hover:bg-surface-muted active:bg-surface-muted',
        danger: 'bg-danger text-on-inverse hover:opacity-90 active:opacity-80',
      },
      size: {
        sm: 'h-control-sm px-4 text-sm',
        md: 'h-control px-6 text-base',
        lg: 'h-control-lg px-8 text-base',
      },
      block: { true: 'w-full', false: '' },
    },
    defaultVariants: { variant: 'primary', size: 'md', block: false },
  },
);

export interface ButtonProps
  extends Omit<ComponentPropsWithoutRef<'button'>, 'color'>, VariantProps<typeof buttonStyles> {
  /** Replaces the content with a spinner and blocks interaction. */
  isLoading?: boolean;
  /** Announced to assistive technology while `isLoading` is set. */
  loadingLabel?: string;
  iconStart?: ReactNode;
  iconEnd?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant,
    size,
    block,
    isLoading = false,
    loadingLabel,
    iconStart,
    iconEnd,
    className,
    children,
    disabled,
    type = 'button',
    ...props
  },
  ref,
) {
  return (
    <button
      ref={ref}
      // `type` defaults to "submit" inside a form, which submits by accident.
      type={type}
      className={cn(buttonStyles({ variant, size, block }), className)}
      disabled={disabled === true || isLoading}
      aria-busy={isLoading || undefined}
      {...props}
    >
      {isLoading ? (
        <>
          <Spinner aria-hidden />
          <span>{loadingLabel ?? children}</span>
        </>
      ) : (
        <>
          {iconStart !== undefined && <span aria-hidden>{iconStart}</span>}
          {children}
          {iconEnd !== undefined && <span aria-hidden>{iconEnd}</span>}
        </>
      )}
    </button>
  );
});
