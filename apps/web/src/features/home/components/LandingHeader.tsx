import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { LanguageSwitcher } from '../../locale/index.js';
import { ThemeToggle } from '../../theme/index.js';
import { CtaLink } from './CtaLink.js';

/** Anchor target for the header's "How it works" link. */
export const HOW_IT_WORKS_ID = 'how-it-works';

/**
 * The landing page's own header.
 *
 * The app's chrome is a bordered bar with a search link; the design gives the
 * landing page a borderless header sitting inside the content column, with the
 * wordmark set in mixed case rather than the app's uppercase. They are
 * different surfaces for different readers, so they are different components
 * rather than one with a flag.
 *
 * The language and theme controls are not in the design. They are here anyway:
 * this is the first page a visitor sees, and a trilingual product whose front
 * door offers no way to change language is broken in a way a mockup cannot
 * show. They sit before the call to action so the lime pill keeps the end of
 * the row, as it does in the design.
 */
export function LandingHeader(): JSX.Element {
  const { t } = useTranslation(['home', 'common']);

  return (
    <header className="mx-auto flex max-w-content flex-wrap items-center gap-x-8 gap-y-4 px-6 pt-10 md:pt-14">
      <Link to="" className="font-display text-lg text-brand-mark">
        {t('common:brand')}
      </Link>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-4 md:ms-auto">
        <nav aria-label={t('home:nav.label')}>
          <a
            href={`#${HOW_IT_WORKS_ID}`}
            className="font-body text-base text-text-secondary hover:text-text"
          >
            {t('home:nav.howItWorks')}
          </a>
        </nav>
        <ThemeToggle />
        <LanguageSwitcher />
        <CtaLink to="listings">{t('home:nav.start')}</CtaLink>
      </div>
    </header>
  );
}
