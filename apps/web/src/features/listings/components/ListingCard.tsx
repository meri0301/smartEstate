import type { ListingSummary } from '@smartestate/contracts';
import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useCurrentLocale } from '../../../shared/i18n/I18nProvider.js';
import {
  formatAmd,
  formatArea,
  formatPricePerSqm,
  formatRelativeTime,
} from '../../../shared/i18n/formatters.js';
import { Badge, Card, Heading, Text } from '../../../shared/ui/index.js';

export interface ListingCardProps {
  listing: ListingSummary;
  /** Path of the detail page, built by the caller so the locale segment stays in one place. */
  to: string;
  onHover?: ((id: string | undefined) => void) | undefined;
}

/**
 * One result.
 *
 * The whole card is a single link rather than a clickable container, so it
 * reaches the keyboard and the screen-reader rotor as one item, and the title
 * carries the accessible name. Everything else inside is presentational.
 */
export function ListingCard({ listing, to, onHover }: ListingCardProps): JSX.Element {
  const { t } = useTranslation('listings');
  const locale = useCurrentLocale();

  return (
    <Card
      as="li"
      padding="none"
      className="overflow-hidden transition-colors duration-[var(--se-duration-fast)] ease-standard hover:border-border-interactive focus-within:border-border-interactive"
      onMouseEnter={() => onHover?.(listing.id)}
      onMouseLeave={() => onHover?.(undefined)}
    >
      <Link to={to} className="flex h-full flex-col focus-visible:outline-none">
        <div className="aspect-[4/3] w-full overflow-hidden bg-surface-muted">
          {listing.thumbnailUrl === null ? (
            <div className="grid h-full place-items-center">
              <Text size="sm" tone="muted">
                {t('photoCount', { count: 0 })}
              </Text>
            </div>
          ) : (
            <img
              src={listing.thumbnailUrl}
              alt=""
              loading="lazy"
              className="h-full w-full object-cover"
            />
          )}
        </div>

        <div className="flex flex-1 flex-col gap-3 p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <Text as="span" size="lg" className="font-semibold">
              {formatAmd(listing.priceAmd, locale, { compact: true })}
            </Text>
            <Text as="span" size="sm" tone="muted">
              {formatPricePerSqm(listing.pricePerSqmAmd, locale)}
            </Text>
          </div>

          <Heading as="h3" size="sm" transform="none" className="line-clamp-2 text-base">
            {listing.title}
          </Heading>

          <Text size="sm" tone="muted">
            {[
              t('roomCount', { count: listing.rooms }),
              formatArea(listing.totalArea, locale),
              t('floorOf', { floor: listing.floor, total: listing.totalFloors }),
            ].join(' · ')}
          </Text>

          <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
            <Badge tone="neutral" size="sm">
              {listing.district.name[locale]}
            </Badge>
            <Badge tone="accent" size="sm">
              {t(`condition.${listing.condition}`)}
            </Badge>
          </div>

          <Text size="sm" tone="muted">
            {t('publishedRelative', { when: formatRelativeTime(listing.publishedAt, locale) })}
          </Text>
        </div>
      </Link>
    </Card>
  );
}
