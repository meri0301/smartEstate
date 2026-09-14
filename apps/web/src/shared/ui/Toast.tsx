import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type JSX,
  type ReactNode,
} from 'react';
import { cn } from './cn.js';
import { Text } from './typography.js';

export type ToastTone = 'neutral' | 'success' | 'danger' | 'info';

export interface ToastOptions {
  title: string;
  description?: string;
  tone?: ToastTone;
  /** Milliseconds before automatic dismissal; 0 keeps it until dismissed. */
  duration?: number;
}

interface ToastRecord extends Required<Omit<ToastOptions, 'description'>> {
  id: number;
  description: string | undefined;
}

interface ToastContextValue {
  show: (options: ToastOptions) => number;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const DEFAULT_DURATION = 5000;

const toneStyles: Record<ToastTone, string> = {
  neutral: 'border-border bg-surface text-text',
  success: 'border-success bg-success-subtle text-success',
  danger: 'border-danger bg-danger-subtle text-danger',
  info: 'border-info bg-info-subtle text-info',
};

export interface ToastProviderProps {
  children: ReactNode;
  /** Names the notification region; must be translated by the caller. */
  regionLabel: string;
  dismissLabel: string;
}

/**
 * Transient notifications.
 *
 * The region is a live region so a message is announced without stealing focus.
 * Errors use `role="alert"` and are assertive, everything else is polite, which
 * is the distinction WAI-ARIA draws between "act now" and "for your
 * information". Auto-dismissal is paused while the pointer is over the region,
 * so a message cannot vanish while it is being read.
 */
export function ToastProvider({
  children,
  regionLabel,
  dismissLabel,
}: ToastProviderProps): JSX.Element {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);
  const nextId = useRef(1);
  const [paused, setPaused] = useState(false);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const show = useCallback((options: ToastOptions): number => {
    const id = nextId.current;
    nextId.current += 1;
    setToasts((current) => [
      ...current,
      {
        id,
        title: options.title,
        description: options.description,
        tone: options.tone ?? 'neutral',
        duration: options.duration ?? DEFAULT_DURATION,
      },
    ]);
    return id;
  }, []);

  useEffect(() => {
    if (paused) {
      return;
    }
    const timers = toasts
      .filter((toast) => toast.duration > 0)
      .map((toast) =>
        setTimeout(() => {
          dismiss(toast.id);
        }, toast.duration),
      );
    return () => {
      for (const timer of timers) {
        clearTimeout(timer);
      }
    };
  }, [toasts, paused, dismiss]);

  const value = useMemo(() => ({ show, dismiss }), [show, dismiss]);

  return (
    <ToastContext value={value}>
      {children}
      <div
        aria-label={regionLabel}
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[var(--se-z-toast)] flex flex-col items-center gap-3 p-4"
        onMouseEnter={() => {
          setPaused(true);
        }}
        onMouseLeave={() => {
          setPaused(false);
        }}
      >
        <div aria-live="polite" className="contents">
          {toasts
            .filter((toast) => toast.tone !== 'danger')
            .map((toast) => (
              <ToastCard
                key={toast.id}
                toast={toast}
                onDismiss={dismiss}
                dismissLabel={dismissLabel}
              />
            ))}
        </div>
        <div aria-live="assertive" className="contents">
          {toasts
            .filter((toast) => toast.tone === 'danger')
            .map((toast) => (
              <ToastCard
                key={toast.id}
                toast={toast}
                onDismiss={dismiss}
                dismissLabel={dismissLabel}
              />
            ))}
        </div>
      </div>
    </ToastContext>
  );
}

function ToastCard({
  toast,
  onDismiss,
  dismissLabel,
}: {
  toast: ToastRecord;
  onDismiss: (id: number) => void;
  dismissLabel: string;
}): JSX.Element {
  return (
    <div
      role={toast.tone === 'danger' ? 'alert' : 'status'}
      className={cn(
        'pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-md border p-4 shadow-overlay',
        toneStyles[toast.tone],
      )}
    >
      <div className="flex flex-1 flex-col gap-1">
        <Text as="span" size="sm" weight="semibold" className="text-inherit">
          {toast.title}
        </Text>
        {toast.description !== undefined && (
          <Text as="span" size="sm" className="text-inherit opacity-80">
            {toast.description}
          </Text>
        )}
      </div>
      <button
        type="button"
        aria-label={dismissLabel}
        onClick={() => {
          onDismiss(toast.id);
        }}
        className="-m-1 rounded-xs p-1 text-inherit opacity-70 transition-opacity hover:opacity-100"
      >
        <svg viewBox="0 0 20 20" fill="none" aria-hidden className="size-4">
          <path
            d="m5 5 10 10M15 5 5 15"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </div>
  );
}

export function useToast(): ToastContextValue {
  const value = useContext(ToastContext);
  if (value === null) {
    throw new Error('useToast must be used inside a <ToastProvider>');
  }
  return value;
}
