import type { ListingDetail } from '@smartestate/contracts';
import type { JSX, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useCurrentLocale } from '../../../shared/i18n/I18nProvider.js';
import { formatArea, formatNumber } from '../../../shared/i18n/formatters.js';
import { Heading } from '../../../shared/ui/index.js';

export interface ListingAttributesProps {
  listing: ListingDetail;
}

/**
 * The specification.
 *
 * A description list, because that is what it is: each row is a term and its
 * value, and a screen reader reads the pair. Rows with nothing to say are left
 * out rather than shown empty, so a sparse listing does not look broken.
 */
export function ListingAttributes({ listing }: ListingAttributesProps): JSX.Element {
  const { t } = useTranslation('listings');
  const locale = useCurrentLocale();
  const yesNo = (value: boolean): string => (value ? t('common.yes') : t('common.no'));

  const rows: { term: string; value: ReactNode }[] = [
    { term: t('attributes.rooms'), value: t('roomCount', { count: listing.rooms }) },
    { term: t('attributes.area'), value: formatArea(listing.totalArea, locale) },
    ...(listing.livingArea === null
      ? []
      : [{ term: t('attributes.livingArea'), value: formatArea(listing.livingArea, locale) }]),
    ...(listing.kitchenArea === null
      ? []
      : [{ term: t('attributes.kitchenArea'), value: formatArea(listing.kitchenArea, locale) }]),
    {
      term: t('attributes.floor'),
      value: t('floorOf', { floor: listing.floor, total: listing.building.totalFloors }),
    },
    { term: t('attributes.bathrooms'), value: formatNumber(listing.bathrooms, locale) },
    ...(listing.ceilingHeight === null
      ? []
      : [
          {
            term: t('attributes.ceilingHeight'),
            value: `${formatNumber(listing.ceilingHeight, locale, { maximumFractionDigits: 2 })} m`,
          },
        ]),
    { term: t('attributes.balconies'), value: formatNumber(listing.balconyCount, locale) },
    { term: t('attributes.condition'), value: t(`condition.${listing.condition}`) },
    { term: t('attributes.heating'), value: t(`heating.${listing.heating}`) },
    { term: t('attributes.parking'), value: yesNo(listing.hasParking) },
    { term: t('attributes.storage'), value: yesNo(listing.hasStorage) },
    { term: t('attributes.negotiable'), value: yesNo(listing.priceNegotiable) },
    { term: t('attributes.documents'), value: t(`ownershipDocs.${listing.ownershipDocs}`) },
  ];

  const building: { term: string; value: ReactNode }[] = [
    {
      term: t('attributes.buildingType'),
      value: t(`buildingType.${listing.building.buildingType}`),
    },
    {
      term: t('attributes.constructionYear'),
      value: formatNumber(listing.building.constructionYear, locale, { useGrouping: false }),
    },
    {
      term: t('attributes.totalFloors'),
      value: formatNumber(listing.building.totalFloors, locale),
    },
    { term: t('attributes.elevator'), value: yesNo(listing.building.hasElevator) },
    { term: t('attributes.seismicRetrofit'), value: yesNo(listing.building.seismicRetrofit) },
  ];

  return (
    <div className="grid gap-8 sm:grid-cols-2">
      <AttributeList title={t('detail.overview')} rows={rows} />
      <AttributeList title={t('detail.building')} rows={building} />
    </div>
  );
}

function AttributeList({
  title,
  rows,
}: {
  title: string;
  rows: readonly { term: string; value: ReactNode }[];
}): JSX.Element {
  return (
    <section className="flex flex-col gap-4">
      <Heading as="h2" size="sm" transform="none">
        {title}
      </Heading>
      <dl className="flex flex-col divide-y divide-border">
        {rows.map((row) => (
          <div key={row.term} className="flex items-baseline justify-between gap-4 py-2">
            <dt className="font-body text-sm text-text-muted">{row.term}</dt>
            <dd className="text-end font-body text-sm font-medium text-text">{row.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
