import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';
import { MortgageCalculator } from '../../features/mortgage/index.js';
import { Heading, Text } from '../../shared/ui/index.js';

/**
 * The refund calculator, as a page of its own.
 *
 * A buyer works out what they can afford before they pick a flat, so this is
 * reachable without one. Arriving from a listing prefills the price and the
 * district through the query string, which keeps the link shareable and means
 * the page has no state the address does not carry.
 */
export function MortgagePage(): JSX.Element {
  const { t } = useTranslation('mortgage');
  const [params] = useSearchParams();

  const price = Number(params.get('price'));
  const districtSlug = params.get('district') ?? undefined;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex max-w-3xl flex-col gap-2">
        <Heading as="h1" size="lg">
          {t('title')}
        </Heading>
        <Text tone="muted">{t('intro')}</Text>
      </div>

      <MortgageCalculator
        {...(Number.isFinite(price) && price > 0 ? { initialPropertyValueAmd: price } : {})}
        {...(districtSlug === undefined ? {} : { initialDistrictSlug: districtSlug })}
      />
    </div>
  );
}
