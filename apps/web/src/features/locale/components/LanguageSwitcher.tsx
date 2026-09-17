import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink, useLocation } from 'react-router';
import { withLocalePath } from '../../../shared/i18n/detect.js';
import { useCurrentLocale } from '../../../shared/i18n/I18nProvider.js';
import { LOCALE_DESCRIPTORS } from '../../../shared/i18n/locales.js';
import { cn } from '../../../shared/ui/cn.js';

/**
 * Language choice as links rather than a dropdown.
 *
 * Each language points at the current page in that language, so the choice is
 * bookmarkable, survives a share, and is visible to a crawler. A `<select>`
 * would hide all of that behind script.
 *
 * The visible label is the abbreviated name and the full one is the link's
 * accessible name. Three languages spelled out cost more of a header than they
 * are worth — and collapsing them into a menu to save the room would give up
 * everything the previous paragraph is about.
 */
export function LanguageSwitcher({ className }: { className?: string }): JSX.Element {
  const { t } = useTranslation();
  const current = useCurrentLocale();
  const { pathname, search } = useLocation();

  return (
    <nav aria-label={t('language.label')} className={cn('flex items-center gap-1', className)}>
      {LOCALE_DESCRIPTORS.map((descriptor) => {
        const isCurrent = descriptor.locale === current;
        return (
          <NavLink
            key={descriptor.locale}
            to={{ pathname: withLocalePath(pathname, descriptor.locale), search }}
            lang={descriptor.locale}
            hrefLang={descriptor.locale}
            aria-current={isCurrent ? 'true' : undefined}
            aria-label={
              isCurrent
                ? t('language.current', { language: descriptor.nativeName })
                : t('language.switchTo', { language: descriptor.nativeName })
            }
            className={cn(
              'rounded-full px-2.5 py-1 font-body text-xs font-semibold tracking-wide transition-colors',
              'duration-[var(--se-duration-fast)] ease-standard',
              isCurrent
                ? 'bg-accent text-on-accent'
                : 'text-text-muted hover:bg-surface-muted hover:text-text',
            )}
          >
            {descriptor.shortName}
          </NavLink>
        );
      })}
    </nav>
  );
}
