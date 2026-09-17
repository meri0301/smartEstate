import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { VALUATION_ID } from '../../valuation/index.js';
import { Heading, Text } from '../../../shared/ui/index.js';
import { FAQ_ID } from './Faq.js';
import { HOW_IT_WORKS_ID } from './LandingHeader.js';
import { WHY_ID } from './WhySmartEstate.js';

/**
 * Where each footer link goes. Anchors for the sections of this page, a route
 * for the catalogue.
 *
 * The design's column also lists "Pricing". There is no pricing: no payment
 * surface exists anywhere in the product, no route serves one, and the FAQ two
 * sections above says there is nothing to buy. A link to a page that cannot
 * exist is a worse footer than a shorter one.
 */
const LINKS = [
  { key: 'howItWorks', href: `#${HOW_IT_WORKS_ID}` },
  { key: 'valuation', href: `#${VALUATION_ID}` },
  { key: 'features', href: `#${WHY_ID}` },
  { key: 'faq', href: `#${FAQ_ID}` },
] as const;

/**
 * The foot of the landing page.
 *
 * A `<footer>` outside `<main>`, so it is the landmark a screen reader expects
 * rather than the last thing inside the article.
 *
 * The design puts three social icons on the right. They are not here, because
 * this project has no accounts to point them at and an icon linking to `#` or
 * to somebody else's profile is worse than a gap. They go in the moment there
 * is somewhere real to send a reader.
 */
export function LandingFooter(): JSX.Element {
  const { t } = useTranslation(['home', 'common']);
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-content flex-col gap-10 px-6 py-12 md:flex-row md:justify-between md:gap-16">
        <div className="flex max-w-md flex-col gap-4">
          <Link to="" className="self-start font-display text-lg text-brand-mark">
            {t('common:brand')}
          </Link>
          <Text size="sm" tone="muted">
            {t('home:footer.tagline')}
          </Text>
        </div>

        <nav aria-label={t('home:footer.product')} className="flex flex-col gap-3">
          <Heading as="h2" size="sm">
            {t('home:footer.product')}
          </Heading>
          <ul className="flex flex-col gap-2">
            {LINKS.map((link) => (
              <li key={link.key}>
                <a
                  href={link.href}
                  className="font-body text-sm text-text-secondary underline-offset-4 hover:text-text hover:underline"
                >
                  {t(`home:footer.links.${link.key}`)}
                </a>
              </li>
            ))}
            <li>
              <Link
                to="listings"
                className="font-body text-sm text-text-secondary underline-offset-4 hover:text-text hover:underline"
              >
                {t('home:footer.links.listings')}
              </Link>
            </li>
          </ul>
        </nav>
      </div>

      <div className="mx-auto flex max-w-content flex-col gap-2 px-6 pb-12">
        <Text size="xs" tone="muted">
          {t('home:footer.copyright', { year })}
        </Text>
        <Text size="xs" tone="muted" className="max-w-2xl">
          {t('home:footer.project')}
        </Text>
      </div>
    </footer>
  );
}
