import { useState, type JSX } from 'react';
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
 * Three-way theme choice, including "match system", which is the state the
 * tokens stylesheet expresses by having no `data-theme` attribute at all.
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
      className={cn('flex items-center gap-1', className)}
    >
      {OPTIONS.map((option) => (
        <button
          key={option}
          type="button"
          role="radio"
          aria-checked={preference === option}
          onClick={() => {
            choose(option);
          }}
          className={cn(
            'rounded-full px-3 py-1 font-body text-sm transition-colors',
            'duration-[var(--se-duration-fast)] ease-standard',
            preference === option
              ? 'bg-surface-muted text-text'
              : 'text-text-muted hover:text-text',
          )}
        >
          {t(`theme.${option}`)}
        </button>
      ))}
    </div>
  );
}
