import type { JSX, ReactNode } from 'react';
import { useId } from 'react';
import { cn } from './cn.js';
import { Text } from './typography.js';

export interface FieldIds {
  id: string;
  hintId: string;
  errorId: string;
  /** Value for `aria-describedby`, or undefined when there is nothing to describe. */
  describedBy: string | undefined;
}

/**
 * Stable ids for a control and its help text. Generated with `useId` so a
 * component can be rendered more than once on a page without colliding.
 */
export function useFieldIds(
  providedId: string | undefined,
  hasHint: boolean,
  hasError: boolean,
): FieldIds {
  const generated = useId();
  const id = providedId ?? generated;
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const described = [hasHint ? hintId : null, hasError ? errorId : null].filter(
    (value): value is string => value !== null,
  );
  return {
    id,
    hintId,
    errorId,
    describedBy: described.length > 0 ? described.join(' ') : undefined,
  };
}

export interface FieldProps {
  ids: FieldIds;
  label: ReactNode;
  hint?: ReactNode;
  /** When present the field renders as invalid and the hint is replaced. */
  error?: ReactNode;
  required?: boolean;
  /** Visually hides the label while leaving it available to assistive technology. */
  hideLabel?: boolean;
  className?: string;
  children: ReactNode;
}

/**
 * Label, control and message chrome shared by every form control, so the
 * association between them is wired in exactly one place.
 */
export function Field({
  ids,
  label,
  hint,
  error,
  required = false,
  hideLabel = false,
  className,
  children,
}: FieldProps): JSX.Element {
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <label
        htmlFor={ids.id}
        className={cn('font-body text-sm font-medium text-text', hideLabel && 'sr-only')}
      >
        {label}
        {required && (
          <span className="text-danger" aria-hidden>
            {' *'}
          </span>
        )}
      </label>
      {children}
      {error !== undefined ? (
        <Text as="span" size="sm" tone="danger" id={ids.errorId} role="alert">
          {error}
        </Text>
      ) : (
        hint !== undefined && (
          <Text as="span" size="sm" tone="muted" id={ids.hintId}>
            {hint}
          </Text>
        )
      )}
    </div>
  );
}

/** Shared look of a text-like control: input, textarea and select. */
export const controlClassName = [
  'w-full rounded-sm border bg-surface-muted px-2 py-4',
  'font-body text-base text-text placeholder:text-text-placeholder',
  'border-border transition-colors duration-[var(--se-duration-fast)] ease-standard',
  'hover:border-border-interactive',
  'disabled:cursor-not-allowed disabled:opacity-60',
  'aria-[invalid=true]:border-danger',
].join(' ');
