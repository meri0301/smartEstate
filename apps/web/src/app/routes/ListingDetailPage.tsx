import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import {
  ListingAttributes,
  ListingGallery,
  PriceHistory,
  useListing,
} from '../../features/listings/index.js';
import { ListingMap } from '../../features/map/index.js';
import { useCurrentLocale } from '../../shared/i18n/I18nProvider.js';
import {
  formatAmd,
  formatDate,
  formatPricePerSqm,
  formatRelativeTime,
} from '../../shared/i18n/formatters.js';
import {
  Badge,
  Button,
  Card,
  Heading,
  Skeleton,
  SkeletonText,
  Text,
} from '../../shared/ui/index.js';

/**
 * One listing in full.
 *
 * The route accepts either the uuid or the short public id, because the API
 * does; links inside the application use the public id, which is what a person
 * would read out or paste into a message.
 */
export function ListingDetailPage(): JSX.Element {
  const { t } = useTranslation(['listings', 'common']);
  const locale = useCurrentLocale();
  const { idOrPublicId } = useParams();
  const listing = useListing(idOrPublicId ?? '', locale);

  if (listing.isPending) {
    return <DetailSkeleton />;
  }

  if (listing.error !== null) {
    const missing = listing.error.statusCode === 404;
    return (
      <Card tone="outline" className="flex flex-col items-start gap-4">
        <Heading as="h1" size="sm">
          {missing ? t('listings:detail.notFound') : t('listings:search.error')}
        </Heading>
        <Text tone="muted">
          {missing ? t('listings:detail.notFoundHint') : listing.error.message}
        </Text>
        <Button
          variant="outline"
          onClick={() => {
            void listing.refetch();
          }}
        >
          {t('common:actions.retry')}
        </Button>
        <Link to={`/${locale}/listings`} className="font-body text-sm underline">
          {t('listings:detail.backToSearch')}
        </Link>
      </Card>
    );
  }

  const data = listing.data;
  const machineTranslated = data.translations.find(
    (translation) => translation.locale === data.locale && translation.isMachineTranslated,
  );

  return (
    <article className="flex flex-col gap-10">
      <nav aria-label={t('listings:detail.breadcrumb')}>
        <Link to={`/${locale}/listings`} className="font-body text-sm text-text-muted underline">
          {t('listings:detail.backToSearch')}
        </Link>
      </nav>

      <header className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="neutral" size="sm">
            {data.district.name[locale]}
          </Badge>
          <Badge tone="accent" size="sm">
            {t(`listings:condition.${data.condition}`)}
          </Badge>
          {data.status !== 'PUBLISHED' && (
            <Badge tone="warning" size="sm">
              {t(`listings:status.${data.status}`)}
            </Badge>
          )}
          <Text as="span" size="sm" tone="muted">
            {data.publicId}
          </Text>
        </div>

        <Heading as="h1" size="lg">
          {data.title}
        </Heading>

        <div className="flex flex-wrap items-baseline gap-4">
          <Text as="span" size="lg" className="font-semibold">
            {formatAmd(data.priceAmd, locale)}
          </Text>
          <Text as="span" tone="muted">
            {formatPricePerSqm(data.pricePerSqmAmd, locale)}
          </Text>
        </div>

        <Text size="sm" tone="muted">
          {`${data.building.street[locale]} ${data.building.houseNumber}`}
        </Text>
        <Text size="sm" tone="muted">
          {t('listings:publishedRelative', {
            when: formatRelativeTime(data.publishedAt, locale),
          })}
        </Text>
      </header>

      <ListingGallery media={data.media} title={data.title} />

      {machineTranslated !== undefined && (
        <Card tone="muted" className="flex flex-col gap-1">
          <Text className="font-medium">{t('listings:machineTranslated')}</Text>
          <Text size="sm" tone="muted">
            {t('listings:machineTranslatedHint', { sourceLanguage: 'hy' })}
          </Text>
        </Card>
      )}

      <section className="flex flex-col gap-4">
        <Heading as="h2" size="sm" transform="none">
          {t('listings:detail.description')}
        </Heading>
        <Text className="whitespace-pre-line">{data.description}</Text>
      </section>

      <ListingAttributes listing={data} />

      <PriceHistory entries={data.priceHistory} />

      <section className="flex flex-col gap-4">
        <Heading as="h2" size="sm" transform="none">
          {t('listings:detail.location')}
        </Heading>
        <ListingMap
          markers={[
            {
              id: data.id,
              lat: data.location.lat,
              lon: data.location.lon,
              short: formatAmd(data.priceAmd, locale, { compact: true }),
              title: data.title,
              subtitle: data.building.addressLine,
            },
          ]}
          label={t('listings:map.singleLabel', { address: data.building.addressLine })}
          className="h-96 w-full overflow-hidden rounded-md border border-border"
        />
        <Text size="sm" tone="muted">
          {t('listings:detail.lastUpdated', { date: formatDate(data.updatedAt, locale, 'medium') })}
        </Text>
      </section>
    </article>
  );
}

function DetailSkeleton(): JSX.Element {
  const { t } = useTranslation('common');
  return (
    <div className="flex flex-col gap-8" aria-busy aria-label={t('loading')}>
      <Skeleton className="h-8 w-2/3" />
      <Skeleton className="aspect-[3/2] w-full" shape="card" />
      <SkeletonText lines={4} />
      <Skeleton className="h-64 w-full" shape="card" />
    </div>
  );
}
