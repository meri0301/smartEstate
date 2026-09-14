import { useId, useState, type JSX, type ReactElement, type ReactNode } from 'react';
import { cloneElement } from 'react';
import { cn } from './cn.js';

export type TooltipPlacement = 'top' | 'bottom';

export interface TooltipProps {
  /** Text shown in the bubble. Keep it short; it is not reachable by pointer. */
  content: ReactNode;
  placement?: TooltipPlacement;
  children: ReactElement<{ 'aria-describedby'?: string }>;
  className?: string;
}

/**
 * Supplementary label for a control that already has an accessible name.
 *
 * It appears on hover and on keyboard focus, is wired with `aria-describedby`
 * rather than `title`, and closes on Escape, which WAI-ARIA requires. It is
 * deliberately not a replacement for a label: if the trigger has no name of its
 * own, give it one instead of relying on this.
 */
export function Tooltip({
  content,
  placement = 'top',
  children,
  className,
}: TooltipProps): JSX.Element {
  const id = useId();
  const [open, setOpen] = useState(false);

  const trigger = cloneElement(children, { 'aria-describedby': open ? id : undefined });

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => {
        setOpen(true);
      }}
      onMouseLeave={() => {
        setOpen(false);
      }}
      onFocusCapture={() => {
        setOpen(true);
      }}
      onBlurCapture={() => {
        setOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open) {
          setOpen(false);
        }
      }}
    >
      {trigger}
      <span
        role="tooltip"
        id={id}
        hidden={!open}
        className={cn(
          'absolute left-1/2 z-[var(--se-z-popover)] w-max max-w-64 -translate-x-1/2',
          'rounded-sm bg-inverse px-3 py-2 font-body text-xs text-on-inverse shadow-overlay',
          placement === 'top' ? 'bottom-full mb-2' : 'top-full mt-2',
          className,
        )}
      >
        {content}
      </span>
    </span>
  );
}
