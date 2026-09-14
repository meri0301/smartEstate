import type { ListingSummary } from '@smartestate/contracts';
import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';
import type { ApiError } from '../../../shared/api/api-error.js';
import { Button, Card, Skeleton, SkeletonText, Text } from '../../../shared/ui/index.js';
import { ListingCard } from './ListingCard.js';

export interface ListingResultsProps {
  listings: readonly ListingSummary[];
  isLoading: boolean;
  error: ApiError | null;
  hasMore: boolean;
  isLoadingMore: boolean;
  onLoadMore: () => void;
  onRetry: () => void;
  /** Builds the detail path for one listing; the locale segment lives with the caller. */
  hrefOf: (listing: ListingSummary) => string;
  onHover?: ((id: string | undefined) => void) | undefined;
}

/**
 * The result list and the three states that are not "here are some results":
 * loading, failed, and nothing matched. Each is its own visible message rather
 * than an empty grid, because an empty grid tells the reader nothing about
 * which of the three happened.
 */
export function ListingResults({
  listings,
  isLoading,
  error,
  hasMore,
  isLoadingMore,
  onLoadMore,
  onRetry,
  hrefOf,
  onHover,
}: ListingResultsProps): JSX.Element {
  const { t } = useTranslation(['listings', 'common']);

  if (isLoading) {
    return <ResultSkeletons />;
  }

  if (error !== null) {
    return (
      <Card tone="outline" className="flex flex-col items-start gap-4">
        <Text tone="danger">{t('listings:search.error')}</Text>
        <Text size="sm" tone="muted">
          {error.message}
        </Text>
        <Button variant="outline" onClick={onRetry}>
          {t('common:actions.retry')}
        </Button>
      </Card>
    );
  }

  if (listings.length === 0) {
    return (
      <Card tone="muted" className="flex flex-col gap-2">
        <Text className="font-medium">{t('listings:noResults')}</Text>
        <Text size="sm" tone="muted">
          {t('listings:noResultsHint')}
        </Text>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <ul className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
        {listings.map((listing) => (
          <ListingCard key={listing.id} listing={listing} to={hrefOf(listing)} onHover={onHover} />
        ))}
      </ul>

      {hasMore && (
        <div className="flex justify-center">
          <Button
            variant="outline"
            onClick={onLoadMore}
            isLoading={isLoadingMore}
            loadingLabel={t('common:loading')}
          >
            {t('common:actions.showMore')}
          </Button>
        </div>
      )}
    </div>
  );
}

/** Placeholders in the shape of the cards they replace, so the grid does not jump. */
function ResultSkeletons(): JSX.Element {
  const { t } = useTranslation('common');
  return (
    <div
      className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3"
      aria-busy
      aria-label={t('loading')}
    >
      {Array.from({ length: 6 }, (_, index) => (
        <Card key={index} padding="none" className="overflow-hidden">
          <Skeleton className="aspect-[4/3] w-full rounded-none" />
          <div className="flex flex-col gap-3 p-4">
            <Skeleton className="h-5 w-1/2" />
            <SkeletonText lines={2} />
            <Skeleton className="h-4 w-2/3" />
          </div>
        </Card>
      ))}
    </div>
  );
}
