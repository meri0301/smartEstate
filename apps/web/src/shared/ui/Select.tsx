import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from 'react';
import { cn } from './cn.js';
import { controlClassName, Field, useFieldIds } from './Field.js';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends Omit<ComponentPropsWithoutRef<'select'>, 'id' | 'children'> {
  label: ReactNode;
  options: readonly SelectOption[];
  /** Shown as a disabled first entry when the control has no value yet. */
  placeholder?: string;
  hint?: ReactNode;
  error?: ReactNode;
  hideLabel?: boolean;
  id?: string;
  fieldClassName?: string;
}

/**
 * Built on the native `<select>`. A custom listbox would let the chevron and
 * menu match the design more exactly, but the native control brings correct
 * keyboard behaviour, screen-reader support and the platform picker on mobile
 * for free. The design's own select is a plain field with a chevron, so little
 * is lost.
 */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  {
    label,
    options,
    placeholder,
    hint,
    error,
    hideLabel,
    id,
    required,
    className,
    fieldClassName,
    defaultValue,
    value,
    ...props
  },
  ref,
) {
  const ids = useFieldIds(id, hint !== undefined, error !== undefined);
  const isControlled = value !== undefined;
  const hasInitialValue = isControlled ? value !== '' : defaultValue !== undefined;

  return (
    <Field
      ids={ids}
      label={label}
      hint={hint}
      error={error}
      required={required}
      hideLabel={hideLabel}
      className={fieldClassName}
    >
      <div className="relative">
        <select
          ref={ref}
          id={ids.id}
          required={required}
          aria-invalid={error !== undefined || undefined}
          aria-describedby={ids.describedBy}
          className={cn(controlClassName, 'appearance-none pr-10', className)}
          {...(isControlled ? { value } : { defaultValue: hasInitialValue ? defaultValue : '' })}
          {...props}
        >
          {placeholder !== undefined && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((option) => (
            <option key={option.value} value={option.value} disabled={option.disabled}>
              {option.label}
            </option>
          ))}
        </select>
        <svg
          viewBox="0 0 20 20"
          fill="none"
          aria-hidden
          className="pointer-events-none absolute end-3 top-1/2 size-5 -translate-y-1/2 text-text-muted"
        >
          <path
            d="m5 7.5 5 5 5-5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    </Field>
  );
});
