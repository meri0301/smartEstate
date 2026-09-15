import { LISTING_SORTS, type ListingSort, type ListingSummary } from '@smartestate/contracts';
import { useCallback, useMemo, useState, type JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router';
import { useDistricts } from '../../features/geo/index.js';
import {
  applyParsedFilters,
  FilterChips,
  flattenListings,
  ListingFilters,
  ListingResults,
  parseFilters,
  toQuery,
  toSearchParams,
  useListingsSearch,
  type ListingFilterValues,
} from '../../features/listings/index.js';
import { ListingMap, type MapMarker } from '../../features/map/index.js';
import { NaturalLanguageSearch } from '../../features/search/index.js';
import { useCurrentLocale } from '../../shared/i18n/I18nProvider.js';
import { formatAmd } from '../../shared/i18n/formatters.js';
import { Button, Card, Heading, Select, Text } from '../../shared/ui/index.js';

type View = 'list' | 'map';

/**
 * The search screen.
 *
 * Filters, sort and the chosen view all live in the query string, so the page
 * has no state of its own worth the name: it reads the URL, asks the API, and
 * renders. That makes a filtered search shareable and the back button correct
 * for free.
 */
export function SearchPage(): JSX.Element {
  const { t } = useTranslation(['listings', 'common']);
  const locale = useCurrentLocale();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  const filters = useMemo(() => parseFilters(params), [params]);
  const view: View = params.get('view') === 'map' ? 'map' : 'list';

  const districts = useDistricts();
  const search = useListingsSearch(toQuery(filters, locale));
  const listings = flattenListings(search.data);

  const [hoveredId, setHoveredId] = useState<string | undefined>(undefined);
  const [visibleArea, setVisibleArea] = useState<string | undefined>(undefined);

  const apply = useCallback(
    (next: ListingFilterValues, nextView: View = view): void => {
      const search = toSearchParams(next);
      if (nextView === 'map') {
        search.set('view', 'map');
      }
      setParams(search);
    },
    [setParams, view],
  );

  const hrefOf = useCallback(
    (listing: ListingSummary): string => `/${locale}/listings/${listing.publicId}`,
    [locale],
  );

  const markers: MapMarker[] = useMemo(
    () =>
      listings.map((listing) => ({
        id: listing.id,
        lat: listing.location.lat,
        lon: listing.location.lon,
        short: formatAmd(listing.priceAmd, locale, { compact: true }),
        title: listing.title,
        subtitle: `${t('listings:roomCount', { count: listing.rooms })} · ${listing.district.name[locale]}`,
      })),
    [listings, locale, t],
  );

  const openListing = useCallback(
    (id: string): void => {
      const listing = listings.find((item) => item.id === id);
      if (listing !== undefined) {
        void navigate(hrefOf(listing));
      }
    },
    [listings, navigate, hrefOf],
  );

  const areaDiffers = visibleArea !== undefined && visibleArea !== filters.bbox;

  const resultsWith = (layout: 'grid' | 'column'): JSX.Element => (
    <ListingResults
      layout={layout}
      listings={listings}
      isLoading={search.isPending}
      error={search.error}
      hasMore={search.hasNextPage}
      isLoadingMore={search.isFetchingNextPage}
      onLoadMore={() => {
        void search.fetchNextPage();
      }}
      onRetry={() => {
        void search.refetch();
      }}
      hrefOf={hrefOf}
      onHover={setHoveredId}
    />
  );

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <Heading as="h1" size="lg">
          {t('listings:search.title')}
        </Heading>
        <Text tone="muted" aria-live="polite">
          {search.isPending
            ? t('common:loading')
            : t('listings:resultCount', { count: listings.length })}
        </Text>
      </div>

      <NaturalLanguageSearch
        onParsed={(parsed) => {
          // The parse is applied as ordinary filters, which then appear as chips
          // the reader can remove. Nothing is searched that they cannot see.
          apply(applyParsedFilters(parsed.filters, filters));
        }}
      />

      <FilterChips
        values={filters}
        districts={districts.data ?? []}
        onChange={(next) => {
          apply(next);
        }}
      />

      <div className="grid gap-8 lg:grid-cols-[18rem_1fr]">
        <aside className="lg:sticky lg:top-6 lg:self-start">
          <Card tone="muted">
            <ListingFilters
              values={filters}
              districts={districts.data ?? []}
              onChange={(next) => {
                apply(next);
              }}
            />
          </Card>
        </aside>

        <section className="flex flex-col gap-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <Select
              label={t('listings:search.sort')}
              className="max-w-xs"
              value={filters.sort}
              options={LISTING_SORTS.map((sort) => ({
                value: sort,
                label: t(`listings:sort.${sort}`),
              }))}
              onChange={(event) => {
                apply({ ...filters, sort: event.target.value as ListingSort });
              }}
            />
            <div
              className="flex items-center gap-2"
              role="group"
              aria-label={t('listings:search.view')}
            >
              <Button
                variant={view === 'list' ? 'primary' : 'outline'}
                size="sm"
                aria-pressed={view === 'list'}
                onClick={() => {
                  apply(filters, 'list');
                }}
              >
                {t('listings:search.viewList')}
              </Button>
              <Button
                variant={view === 'map' ? 'primary' : 'outline'}
                size="sm"
                aria-pressed={view === 'map'}
                onClick={() => {
                  apply(filters, 'map');
                }}
              >
                {t('listings:search.viewMap')}
              </Button>
            </div>
          </div>

          {view === 'list' ? (
            resultsWith('grid')
          ) : (
            <div className="grid gap-6 xl:grid-cols-[3fr_2fr]">
              <div className="relative">
                <ListingMap
                  markers={markers}
                  label={t('listings:map.label', { count: markers.length })}
                  activeId={hoveredId}
                  fit={filters.bbox === undefined}
                  onAreaChange={setVisibleArea}
                  onSelect={openListing}
                  className="h-[28rem] w-full overflow-hidden rounded-md border border-border xl:h-[40rem]"
                />
                {areaDiffers && (
                  <div className="absolute inset-x-0 bottom-4 flex justify-center">
                    <Button
                      size="sm"
                      onClick={() => {
                        apply({ ...filters, bbox: visibleArea }, 'map');
                      }}
                    >
                      {t('listings:search.searchThisArea')}
                    </Button>
                  </div>
                )}
              </div>
              <div className="max-h-[40rem] overflow-y-auto pe-2">{resultsWith('column')}</div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
