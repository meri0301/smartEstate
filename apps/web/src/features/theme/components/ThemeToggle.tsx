import { useState, type JSX, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../../shared/ui/cn.js';
import {
  applyTheme,
  readStoredTheme,
  storeTheme,
  type ThemePreference,
} from '../../../shared/ui/theme.js';

const OPTIONS: readonly ThemePreference[] = ['light', 'dark', 'system'];

/**
 * A glyph per choice: a sun, a moon, and a screen for "whatever the screen is
 * set to". Drawn rather than lettered because "Match system" is three words in
 * English and longer in the other two, and the control has to sit in a header
 * beside everything else.
 */
const ICONS: Record<ThemePreference, ReactNode> = {
  light: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </>
  ),
  dark: <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" />,
  system: (
    <>
      <rect x="3" y="4.5" width="18" height="12" rx="2" />
      <path d="M8.5 20.5h7M12 16.5v4" />
    </>
  ),
};

/**
 * Three-way theme choice, including "match system", which is the state the
 * tokens stylesheet expresses by having no `data-theme` attribute at all.
 *
 * Icons, with the name of each choice kept as the control's accessible name
 * rather than dropped. A screen reader hears "Match system, radio", the same as
 * it did when the words were on screen; only the header got shorter.
 */
export function ThemeToggle({ className }: { className?: string }): JSX.Element {
  const { t } = useTranslation();
  // Lazy initialiser rather than an effect: the stored value is known on the
  // first render, so setting it afterwards would paint the wrong state first.
  const [preference, setPreference] = useState<ThemePreference>(() =>
    readStoredTheme(globalThis.localStorage),
  );

  const choose = (next: ThemePreference): void => {
    setPreference(next);
    applyTheme(document.documentElement, next);
    storeTheme(globalThis.localStorage, next);
  };

  return (
    <div
      role="radiogroup"
      aria-label={t('theme.label')}
      className={cn('flex items-center gap-0.5', className)}
    >
      {OPTIONS.map((option) => (
        <button
          key={option}
          type="button"
          role="radio"
          aria-checked={preference === option}
          title={t(`theme.${option}`)}
          onClick={() => {
            choose(option);
          }}
          className={cn(
            'flex size-8 items-center justify-center rounded-full transition-colors',
            'duration-[var(--se-duration-fast)] ease-standard',
            preference === option
              ? 'bg-surface-muted text-text'
              : 'text-text-muted hover:text-text',
          )}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className="size-4"
          >
            {ICONS[option]}
          </svg>
          <span className="sr-only">{t(`theme.${option}`)}</span>
        </button>
      ))}
    </div>
  );
}
