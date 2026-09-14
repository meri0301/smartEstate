import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, Outlet, useLocation, useParams } from 'react-router';
import { LanguageSwitcher } from '../../features/locale/index.js';
import { ThemeToggle } from '../../features/theme/index.js';
import { detectLocale, withLocalePath } from '../../shared/i18n/detect.js';
import { I18nProvider } from '../../shared/i18n/I18nProvider.js';
import { isLocale } from '../../shared/i18n/locales.js';
import { useSessionStore } from '../../shared/api/session-store.js';
import { ToastProvider } from '../../shared/ui/index.js';

/**
 * Everything below `/:locale`. The locale segment is the single source of truth
 * for the language, so an unrecognised one is replaced rather than tolerated:
 * `/de/listings` becomes `/hy/listings` instead of rendering a half-translated
 * page.
 */
export function LocaleLayout(): JSX.Element {
  const { locale } = useParams();
  const { pathname, search } = useLocation();
  const profileLocale = useSessionStore((state) => state.user?.locale);

  if (!isLocale(locale)) {
    const detected = detectLocale({
      profileLocale,
      storage: globalThis.localStorage,
      acceptLanguages: globalThis.navigator.languages,
    });
    return (
      <Navigate to={{ pathname: withLocalePath(pathname, detected.locale), search }} replace />
    );
  }

  return (
    <I18nProvider locale={locale}>
      <Shell />
    </I18nProvider>
  );
}

function Shell(): JSX.Element {
  const { t } = useTranslation();
  return (
    <ToastProvider regionLabel={t('notifications.region')} dismissLabel={t('actions.dismiss')}>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:start-4 focus:top-4 focus:z-[var(--se-z-sticky)] focus:rounded-sm focus:bg-surface focus:px-4 focus:py-2"
      >
        {t('skipToContent')}
      </a>

      <header className="border-b border-border">
        <div className="mx-auto flex max-w-content flex-wrap items-center justify-between gap-4 px-6 py-4">
          <Link to="" className="font-display text-lg uppercase text-text">
            {t('brand')}
          </Link>
          <div className="flex flex-wrap items-center gap-4">
            <ThemeToggle />
            <LanguageSwitcher />
          </div>
        </div>
      </header>

      <main id="main" className="mx-auto max-w-content px-6 py-12">
        <Outlet />
      </main>
    </ToastProvider>
  );
}
