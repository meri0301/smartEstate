import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Heading, Text } from '../../shared/ui/index.js';

/**
 * The landing view.
 *
 * Deliberately thin: the product's answer to "should I buy this?" lives on a
 * listing, so the only job here is to get the reader into the search. The
 * advisory panels arrive with the valuation and recommendation work.
 *
 * The call to action is a link wearing the primary button's clothes, rather
 * than a button that navigates, because it goes somewhere: it should open in a
 * new tab on a middle click and offer the browser's own link menu.
 */
export function HomePage(): JSX.Element {
  const { t } = useTranslation(['common', 'listings']);

  return (
    <div className="flex flex-col items-start gap-6 py-8">
      <Heading as="h1" size="xl">
        {t('common:brand')}
      </Heading>
      <Text size="lg" className="max-w-prose">
        {t('common:tagline')}
      </Text>
      <Link
        to="listings"
        className="inline-flex h-control items-center justify-center rounded-full bg-accent px-6 font-body font-semibold text-on-accent transition-colors duration-[var(--se-duration-fast)] ease-standard hover:bg-accent-hover active:bg-accent-active"
      >
        {t('listings:search.title')}
      </Link>
    </div>
  );
}
