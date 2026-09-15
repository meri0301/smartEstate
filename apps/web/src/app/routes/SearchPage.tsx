import { LISTING_SORTS, type ListingSort, type ListingSummary } from '@smartestate/contracts';
import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from 'react';
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
  toParsedFilters,
  toQuery,
  toSearchParams,
  useListingsSearch,
  type ListingFilterValues,
} from '../../features/listings/index.js';
import { ListingMap, type MapMarker } from '../../features/map/index.js';
import {
  NaturalLanguageSearch,
  SemanticNote,
  useHybridSearch,
} from '../../features/search/index.js';
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
  // The sentence lives in the URL like everything else, so a ranked search is
  // shareable and the back button returns to the list it came from.
  const typed = params.get('q')?.trim();
  const query = typed === undefined || typed === '' ? undefined : typed;

  const districts = useDistricts();
  const search = useListingsSearch(toQuery(filters, locale), { enabled: query === undefined });
  const hybrid = useHybridSearch({ query, filters: toParsedFilters(filters), locale });

  // One of the two is running at a time: a sentence is answered by a ranking,
  // anything else by the ordinary filtered page.
  const listings =
    query === undefined
      ? flattenListings(search.data)
      : (hybrid.data?.results ?? []).map((result) => result.listing);
  const isPending = query === undefined ? search.isPending : hybrid.isPending;

  const [hoveredId, setHoveredId] = useState<string | undefined>(undefined);
  const [visibleArea, setVisibleArea] = useState<string | undefined>(undefined);

  /**
   * Writes the next search to the URL.
   *
   * `nextQuery` is `null` to clear the sentence and omitted to keep it. It
   * cannot be `undefined` for "clear", because an omitted argument is also
   * `undefined` and the default would quietly put the sentence back — which is
   * exactly what the clear button did until a test caught it.
   */
  const apply = useCallback(
    (next: ListingFilterValues, nextView: View = view, nextQuery: string | null = null): void => {
      const search = toSearchParams(next);
      if (nextView === 'map') {
        search.set('view', 'map');
      }
      const sentence = nextQuery ?? undefined;
      if (sentence !== undefined) {
        search.set('q', sentence);
      }
      setParams(search);
    },
    [setParams, view],
  );

  /**
   * A sentence arriving with no filters has its own read into the address bar.
   *
   * Someone who shares a ranked search sends a link with the sentence and
   * nothing else. The server reads the sentence and applies what it understood,
   * but the chips are drawn from the URL, so without this the reader would see
   * results narrowed by constraints that were nowhere on the screen — which is
   * the one thing the whole chip design exists to prevent.
   *
   * Once per sentence, guarded by a ref: a reader who then removes every chip
   * means it, and having the sentence put them back would make the chips
   * undismissable.
   */
  const adopted = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (query === undefined || hybrid.data === undefined || adopted.current === query) {
      return;
    }
    adopted.current = query;
    if (Object.keys(toParsedFilters(filters)).length > 0) {
      return;
    }
    if (Object.keys(hybrid.data.filters).length > 0) {
      apply(applyParsedFilters(hybrid.data.filters, filters), view, query);
    }
  }, [query, hybrid.data, filters, apply, view]);

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
      isLoading={isPending}
      error={query === undefined ? search.error : hybrid.error}
      // A fused ranking has no stable key to page by, so there is no next page
      // to offer: `limit` is the whole answer.
      hasMore={query === undefined && search.hasNextPage}
      isLoadingMore={search.isFetchingNextPage}
      onLoadMore={() => {
        void search.fetchNextPage();
      }}
      onRetry={() => {
        void (query === undefined ? search.refetch() : hybrid.refetch());
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
          {isPending ? t('common:loading') : t('listings:resultCount', { count: listings.length })}
        </Text>
      </div>

      <NaturalLanguageSearch
        initialQuery={query ?? ''}
        onParsed={(sentence, parsed) => {
          // The parse is applied as ordinary filters, which then appear as chips
          // the reader can remove. Nothing is searched that they cannot see.
          // The sentence goes with them, and is what ranks the results.
          apply(applyParsedFilters(parsed.filters, filters), view, sentence);
        }}
      />

      {query !== undefined && hybrid.data !== undefined && (
        <SemanticNote
          result={hybrid.data}
          onClear={() => {
            apply(filters, view, null);
          }}
        />
      )}

      <FilterChips
        values={filters}
        districts={districts.data ?? []}
        onChange={(next) => {
          apply(next, view, query ?? null);
        }}
      />

      <div className="grid gap-8 lg:grid-cols-[18rem_1fr]">
        <aside className="lg:sticky lg:top-6 lg:self-start">
          <Card tone="muted">
            <ListingFilters
              values={filters}
              districts={districts.data ?? []}
              onChange={(next) => {
                apply(next, view, query ?? null);
              }}
            />
          </Card>
        </aside>

        <section className="flex flex-col gap-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            {/* A ranking is already an order; offering a sort beside it would
                claim a choice that does not exist. */}
            {query === undefined ? (
              <Select
                label={t('listings:search.sort')}
                className="max-w-xs"
                value={filters.sort}
                options={LISTING_SORTS.map((sort) => ({
                  value: sort,
                  label: t(`listings:sort.${sort}`),
                }))}
                onChange={(event) => {
                  // Only rendered when there is no sentence, so there is none
                  // to carry.
                  apply({ ...filters, sort: event.target.value as ListingSort }, view, null);
                }}
              />
            ) : (
              <div />
            )}
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
                  apply(filters, 'list', query ?? null);
                }}
              >
                {t('listings:search.viewList')}
              </Button>
              <Button
                variant={view === 'map' ? 'primary' : 'outline'}
                size="sm"
                aria-pressed={view === 'map'}
                onClick={() => {
                  apply(filters, 'map', query ?? null);
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
                        apply({ ...filters, bbox: visibleArea }, 'map', query ?? null);
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
