import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Outlet } from 'react-router';
import { LanguageSwitcher } from '../../features/locale/index.js';
import { ThemeToggle } from '../../features/theme/index.js';

/**
 * The chrome every screen inside the product wears: a bordered header with the
 * wordmark and the search link, and the content column beneath it.
 *
 * The landing page does not use it — the design gives that page a header of its
 * own — so this is a layout route around the app's screens rather than part of
 * `LocaleLayout`, which stays responsible for the things every route needs
 * whatever it looks like.
 */
export function AppChrome(): JSX.Element {
  const { t } = useTranslation();

  return (
    <>
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-content flex-wrap items-center justify-between gap-4 px-6 py-4">
          <div className="flex flex-wrap items-baseline gap-6">
            <Link to="" className="font-display text-lg uppercase text-text">
              {t('brand')}
            </Link>
            <Link to="listings" className="font-body text-sm text-text-secondary hover:text-text">
              {t('nav.search')}
            </Link>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <ThemeToggle />
            <LanguageSwitcher />
          </div>
        </div>
      </header>

      <main id="main" className="mx-auto max-w-content px-6 py-12">
        <Outlet />
      </main>
    </>
  );
}
