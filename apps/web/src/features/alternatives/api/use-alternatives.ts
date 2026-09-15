import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { AlternativesResponse, Locale } from '@smartestate/contracts';
import type { ApiError } from '../../../shared/api/api-error.js';
import { api } from '../../../shared/api/client.js';
import { apiRequest } from '../../../shared/api/request.js';

export interface AlternativesInput {
  listingId: string | undefined;
  locale: Locale;
  limit?: number;
}

/**
 * Better options for one listing.
 *
 * A plain query: the answer depends only on the listing and the catalogue, so
 * arriving at the address is enough to ask for it. A 404 is not retried — the
 * listing either exists for this reader or it does not, and asking again will
 * not change that.
 */
export function useAlternatives(
  input: AlternativesInput,
): UseQueryResult<AlternativesResponse, ApiError> {
  const { listingId, locale, limit = 6 } = input;
  return useQuery({
    queryKey: ['alternatives', listingId, locale, limit],
    enabled: listingId !== undefined,
    retry: false,
    queryFn: () =>
      apiRequest(() =>
        api.GET('/api/listings/{id}/alternatives', {
          params: { path: { id: listingId ?? '' }, query: { locale, limit } },
        }),
      ),
  });
}
