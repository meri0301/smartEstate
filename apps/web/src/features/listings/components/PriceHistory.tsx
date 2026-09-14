import type { ListingDetail } from '@smartestate/contracts';
import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { useCurrentLocale } from '../../../shared/i18n/I18nProvider.js';
import { formatAmd, formatDate, formatPercent } from '../../../shared/i18n/formatters.js';
import { Badge, Heading, Text } from '../../../shared/ui/index.js';

export interface PriceHistoryProps {
  entries: ListingDetail['priceHistory'];
}

/**
 * What the asking price has done since the listing appeared.
 *
 * A table rather than a chart: these are a handful of discrete events, the
 * exact figures are the point, and a table needs no library and is readable by
 * a screen reader. The change against the previous entry is computed here
 * because the API stores levels, not deltas.
 */
export function PriceHistory({ entries }: PriceHistoryProps): JSX.Element | null {
  const { t } = useTranslation('listings');
  const locale = useCurrentLocale();

  if (entries.length < 2) {
    return null;
  }

  return (
    <section className="flex flex-col gap-4">
      <Heading as="h2" size="sm" transform="none">
        {t('detail.priceHistory')}
      </Heading>
      <table className="w-full border-collapse text-start font-body text-sm">
        <caption className="sr-only">{t('detail.priceHistoryCaption')}</caption>
        <thead>
          <tr className="border-b border-border text-text-muted">
            <th scope="col" className="py-2 text-start font-medium">
              {t('detail.priceHistoryDate')}
            </th>
            <th scope="col" className="py-2 text-end font-medium">
              {t('detail.priceHistoryPrice')}
            </th>
            <th scope="col" className="py-2 text-end font-medium">
              {t('detail.priceHistoryChange')}
            </th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry, index) => {
            const previous = entries[index - 1];
            const change =
              previous === undefined || previous.priceAmd === 0
                ? null
                : (entry.priceAmd - previous.priceAmd) / previous.priceAmd;
            return (
              <tr key={entry.recordedAt} className="border-b border-border last:border-0">
                <td className="py-2 text-text-secondary">
                  {formatDate(entry.recordedAt, locale, 'medium')}
                </td>
                <td className="py-2 text-end font-medium">{formatAmd(entry.priceAmd, locale)}</td>
                <td className="py-2 text-end">
                  {change === null ? (
                    <Text as="span" size="sm" tone="muted">
                      {'—'}
                    </Text>
                  ) : (
                    <Badge tone={change < 0 ? 'success' : 'warning'} size="sm">
                      {formatPercent(change, locale, 1)}
                    </Badge>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
