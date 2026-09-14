import { cva, type VariantProps } from 'class-variance-authority';
import { useEffect, useId, useRef, type JSX, type ReactNode } from 'react';
import { cn } from './cn.js';
import { Heading, Text } from './typography.js';

const panelStyles = cva(
  ['w-full rounded-md bg-surface p-8 shadow-overlay', 'border border-border text-text-secondary'],
  {
    variants: {
      size: {
        sm: 'max-w-md',
        md: 'max-w-lg',
        lg: 'max-w-2xl',
      },
    },
    defaultVariants: { size: 'md' },
  },
);

export interface ModalProps extends VariantProps<typeof panelStyles> {
  open: boolean;
  /** Called for every dismissal: the close button, Escape, or the backdrop. */
  onClose: () => void;
  title: ReactNode;
  /** Optional supporting line, wired to `aria-describedby`. */
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  /** Label for the close control; must be translated by the caller. */
  closeLabel: string;
  className?: string;
}

/**
 * Built on the native `<dialog>` element, which supplies the focus trap, the
 * Escape handler, the inert background and the top layer. Writing those by hand
 * is the most common source of accessibility bugs in a modal, so the platform
 * does it here and this component only manages open state and layout.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  closeLabel,
  size,
  className,
}: ModalProps): JSX.Element {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) {
      return;
    }
    if (open && !dialog.open) {
      // jsdom does not implement showModal; fall back so the component stays testable.
      if (typeof dialog.showModal === 'function') {
        dialog.showModal();
      } else {
        dialog.setAttribute('open', '');
      }
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={description === undefined ? undefined : descriptionId}
      onClose={onClose}
      onCancel={(event) => {
        // Let React own the open state rather than the DOM closing itself.
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        // A click that lands on the dialog element itself is the backdrop:
        // the panel inside stops propagation of its own clicks.
        if (event.target === dialogRef.current) {
          onClose();
        }
      }}
      className={cn(
        'm-auto w-full max-w-none bg-transparent p-4 backdrop:bg-overlay/60',
        'open:flex open:items-center open:justify-center',
      )}
    >
      <div
        className={cn(panelStyles({ size }), className)}
        onClick={(event) => {
          event.stopPropagation();
        }}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <Heading as="h2" size="sm" id={titleId}>
            {title}
          </Heading>
          <button
            type="button"
            onClick={onClose}
            aria-label={closeLabel}
            className="-m-2 rounded-sm p-2 text-text-muted transition-colors hover:bg-surface-muted hover:text-text"
          >
            <svg viewBox="0 0 20 20" fill="none" aria-hidden className="size-5">
              <path
                d="m5 5 10 10M15 5 5 15"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        {description !== undefined && (
          <Text size="sm" tone="muted" id={descriptionId} className="mb-4">
            {description}
          </Text>
        )}

        {children}

        {footer !== undefined && (
          <div className="mt-8 flex flex-wrap justify-end gap-3">{footer}</div>
        )}
      </div>
    </dialog>
  );
}
