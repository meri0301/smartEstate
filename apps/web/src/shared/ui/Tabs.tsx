import { useCallback, useId, useRef, useState, type JSX, type ReactNode } from 'react';
import { cn } from './cn.js';

export interface TabItem {
  id: string;
  label: ReactNode;
  content: ReactNode;
  disabled?: boolean;
}

export interface TabsProps {
  items: readonly TabItem[];
  /** Controlled selection. Omit for an uncontrolled component. */
  value?: string;
  defaultValue?: string;
  onValueChange?: (id: string) => void;
  /** Names the tab list for assistive technology; must be translated. */
  label: string;
  className?: string;
}

/**
 * Tabs following the WAI-ARIA authoring practice: one stop in the tab order for
 * the whole list, arrow keys to move between tabs, Home and End to jump, and
 * selection following focus. Disabled tabs are skipped rather than focused.
 */
export function Tabs({
  items,
  value,
  defaultValue,
  onValueChange,
  label,
  className,
}: TabsProps): JSX.Element {
  const baseId = useId();
  const firstEnabled = items.find((item) => item.disabled !== true)?.id ?? items[0]?.id ?? '';
  const [internal, setInternal] = useState(defaultValue ?? firstEnabled);
  const selected = value ?? internal;
  const tabRefs = useRef(new Map<string, HTMLButtonElement>());

  const select = useCallback(
    (id: string) => {
      if (value === undefined) {
        setInternal(id);
      }
      onValueChange?.(id);
    },
    [onValueChange, value],
  );

  const move = useCallback(
    (from: string, direction: 1 | -1 | 'first' | 'last') => {
      const enabled = items.filter((item) => item.disabled !== true);
      if (enabled.length === 0) {
        return;
      }
      let next;
      if (direction === 'first') {
        next = enabled[0];
      } else if (direction === 'last') {
        next = enabled.at(-1);
      } else {
        const index = enabled.findIndex((item) => item.id === from);
        next = enabled[(index + direction + enabled.length) % enabled.length];
      }
      if (next === undefined) {
        return;
      }
      select(next.id);
      tabRefs.current.get(next.id)?.focus();
    },
    [items, select],
  );

  return (
    <div className={cn('flex flex-col gap-6', className)}>
      <div
        role="tablist"
        aria-label={label}
        className="flex flex-wrap gap-2 border-b border-border"
      >
        {items.map((item) => {
          const isSelected = item.id === selected;
          return (
            <button
              key={item.id}
              ref={(node) => {
                if (node === null) {
                  tabRefs.current.delete(item.id);
                } else {
                  tabRefs.current.set(item.id, node);
                }
              }}
              type="button"
              role="tab"
              id={`${baseId}-tab-${item.id}`}
              aria-selected={isSelected}
              aria-controls={`${baseId}-panel-${item.id}`}
              tabIndex={isSelected ? 0 : -1}
              disabled={item.disabled}
              onClick={() => {
                select(item.id);
              }}
              onKeyDown={(event) => {
                const keys: Record<string, 1 | -1 | 'first' | 'last' | undefined> = {
                  ArrowRight: 1,
                  ArrowDown: 1,
                  ArrowLeft: -1,
                  ArrowUp: -1,
                  Home: 'first',
                  End: 'last',
                };
                const direction = keys[event.key];
                if (direction !== undefined) {
                  event.preventDefault();
                  move(item.id, direction);
                }
              }}
              className={cn(
                '-mb-px border-b-2 px-4 py-3 font-body text-sm font-semibold',
                'transition-colors duration-[var(--se-duration-fast)] ease-standard',
                'disabled:cursor-not-allowed disabled:opacity-50',
                isSelected
                  ? 'border-text text-text'
                  : 'border-transparent text-text-muted hover:text-text',
              )}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      {items.map((item) => (
        <div
          key={item.id}
          role="tabpanel"
          id={`${baseId}-panel-${item.id}`}
          aria-labelledby={`${baseId}-tab-${item.id}`}
          hidden={item.id !== selected}
          // The panel is focusable so keyboard users can reach content that
          // contains no interactive elements of its own.
          tabIndex={0}
        >
          {item.id === selected && item.content}
        </div>
      ))}
    </div>
  );
}
