import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from 'react';
import { cn } from './cn.js';
import { controlClassName, Field, useFieldIds } from './Field.js';

export interface InputProps extends Omit<ComponentPropsWithoutRef<'input'>, 'id'> {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  hideLabel?: boolean;
  id?: string;
  /** Class names for the wrapper; `className` styles the input itself. */
  fieldClassName?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, hideLabel, id, required, className, fieldClassName, ...props },
  ref,
) {
  const ids = useFieldIds(id, hint !== undefined, error !== undefined);
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
      <input
        ref={ref}
        id={ids.id}
        required={required}
        aria-invalid={error !== undefined || undefined}
        aria-describedby={ids.describedBy}
        className={cn(controlClassName, className)}
        {...props}
      />
    </Field>
  );
});

export interface TextareaProps extends Omit<ComponentPropsWithoutRef<'textarea'>, 'id'> {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  hideLabel?: boolean;
  id?: string;
  fieldClassName?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, hint, error, hideLabel, id, required, className, fieldClassName, rows = 4, ...props },
  ref,
) {
  const ids = useFieldIds(id, hint !== undefined, error !== undefined);
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
      <textarea
        ref={ref}
        id={ids.id}
        rows={rows}
        required={required}
        aria-invalid={error !== undefined || undefined}
        aria-describedby={ids.describedBy}
        className={cn(controlClassName, 'resize-y', className)}
        {...props}
      />
    </Field>
  );
});
