import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { useCurrentLocale } from '../../../shared/i18n/I18nProvider.js';
import { formatAmd, formatNumber } from '../../../shared/i18n/formatters.js';
import { Text, cn } from '../../../shared/ui/index.js';
import type { ComparisonTable as Table } from '../model/comparison.js';

/**
 * The score criteria run from 0 to 1 and are shown as a proportion.
 *
 * "0.99" means nothing to a buyer; "99%" at least reads as a share of the best
 * a listing could do. Inventing words for bands of a continuous scale would be a
 * judgement the server did not make.
 */
const SCORE_MAX = 1;

export interface ComparisonTableProps {
  table: Table;
  /** Builds the detail path for a column heading. */
  hrefOf: (listingId: string, publicId: string) => string;
}

/**
 * The listings side by side, one row per criterion, best value marked.
 *
 * A real table rather than a grid of divs, because it is tabular data and a
 * screen reader should be able to say "price, row 1, column 2". The first column
 * is a row header and the first row is a column header, so every cell has two
 * names.
 *
 * The score criteria are shown as a percentage of the best possible rather than
 * as a raw 0–1 number. "0.99" means nothing to a buyer; "99%" at least reads as
 * a proportion, and the tooltip-free alternative — inventing words for bands of
 * a continuous scale — would be a judgement the server did not make.
 */
export function ComparisonTable({ table, hrefOf }: ComparisonTableProps): JSX.Element {
  const { t } = useTranslation(['alternatives', 'listings']);
  const locale = useCurrentLocale();

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[36rem] border-collapse text-start">
        <caption className="sr-only">{t('alternatives:table.caption')}</caption>
        <thead>
          <tr>
            <th scope="col" className="p-3 text-start align-bottom">
              <Text size="sm" tone="muted">
                {t('alternatives:table.criterion')}
              </Text>
            </th>
            {table.listings.map((listing, index) => (
              <th key={listing.id} scope="col" className="p-3 text-start align-bottom">
                <div className="flex flex-col gap-1">
                  <Text size="sm" tone="muted">
                    {index === 0 ? t('alternatives:table.viewing') : t('alternatives:table.option')}
                  </Text>
                  <a
                    href={hrefOf(listing.id, listing.publicId)}
                    className="font-body text-sm font-medium text-text underline-offset-4 hover:underline"
                  >
                    {listing.title}
                  </a>
                  <Text size="sm">{formatAmd(listing.priceAmd, locale, { compact: true })}</Text>
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row) => (
            <tr key={row.criterion} className="border-t border-border">
              <th scope="row" className="p-3 text-start font-normal">
                <Text size="sm">{t(`alternatives:criterion.${row.criterion}`)}</Text>
              </th>
              {row.cells.map((cell, index) => (
                <td
                  key={table.listings[index]?.id ?? String(index)}
                  className={cn('p-3', cell.isBest && 'bg-surface-muted')}
                >
                  <Text size="sm" weight={cell.isBest ? 'medium' : 'normal'}>
                    {cell.unit === 'amd' && formatAmd(cell.value, locale)}
                    {cell.unit === 'sqm' &&
                      t('listings:area', { area: formatNumber(cell.value, locale) })}
                    {cell.unit === 'metres' &&
                      t('listings:meters', { value: formatNumber(cell.value, locale) })}
                    {cell.unit === 'years' &&
                      t('alternatives:units.years', { count: Math.round(cell.value) })}
                    {cell.unit === 'percent' &&
                      t('alternatives:units.percent', {
                        value: formatNumber(cell.value, locale, {
                          maximumFractionDigits: 1,
                          signDisplay: 'exceptZero',
                        }),
                      })}
                    {cell.unit === 'score' &&
                      formatNumber(cell.value / SCORE_MAX, locale, {
                        style: 'percent',
                        maximumFractionDigits: 0,
                      })}
                  </Text>
                  {cell.isBest && <span className="sr-only"> {t('alternatives:table.best')}</span>}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
