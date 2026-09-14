import {
  useInfiniteQuery,
  useQuery,
  type InfiniteData,
  type UseInfiniteQueryResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import type { ListingDetail, ListingsPage, Locale } from '@smartestate/contracts';
import type { ApiError } from '../../../shared/api/api-error.js';
import { api } from '../../../shared/api/client.js';
import { queryKeys } from '../../../shared/api/query-keys.js';
import { apiRequest } from '../../../shared/api/request.js';
import type { paths } from '../../../shared/api/schema.js';

/** Search filters as the UI holds them: the documented query parameters minus the cursor, which is managed here. */
export type ListingsSearchFilters = Omit<
  NonNullable<paths['/api/listings']['get']['parameters']['query']>,
  'cursor'
>;

/**
 * Cursor-paginated search. Each page's `nextCursor` becomes the next page
 * parameter; `hasNextPage` turns false when the API returns `null`.
 */
export function useListingsSearch(
  filters: ListingsSearchFilters,
): UseInfiniteQueryResult<InfiniteData<ListingsPage, string | undefined>, ApiError> {
  return useInfiniteQuery({
    queryKey: queryKeys.listings.search(filters),
    queryFn: ({ pageParam }) =>
      apiRequest(() =>
        api.GET('/api/listings', {
          params: {
            query: { ...filters, ...(pageParam === undefined ? {} : { cursor: pageParam }) },
          },
        }),
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
}

export function useListing(
  idOrPublicId: string,
  locale?: Locale,
): UseQueryResult<ListingDetail, ApiError> {
  return useQuery({
    queryKey: queryKeys.listings.detail(idOrPublicId, locale),
    queryFn: () =>
      apiRequest(() =>
        api.GET('/api/listings/{idOrPublicId}', {
          params: { path: { idOrPublicId }, query: locale === undefined ? {} : { locale } },
        }),
      ),
    enabled: idOrPublicId.length > 0,
  });
}

/** Flattens the infinite pages into one list for rendering. */
export function flattenListings(
  data: InfiniteData<ListingsPage> | undefined,
): ListingsPage['items'] {
  return data?.pages.flatMap((page) => page.items) ?? [];
}
