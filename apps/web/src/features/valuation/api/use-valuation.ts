import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { Valuation } from '@smartestate/contracts';
import type { ApiError } from '../../../shared/api/api-error.js';
import { api } from '../../../shared/api/client.js';
import { queryKeys } from '../../../shared/api/query-keys.js';
import { apiRequest } from '../../../shared/api/request.js';

/**
 * What the model thinks a listing is worth.
 *
 * A failure here is not a failure of the page: the estimate is an enhancement,
 * and when the model service is down the panel simply does not appear. The
 * query therefore does not retry a 503, because a second attempt half a second
 * later will not have found a model either.
 */
export function useValuation(listingId: string | undefined): UseQueryResult<Valuation, ApiError> {
  return useQuery({
    queryKey: queryKeys.valuation.forListing(listingId ?? ''),
    queryFn: () =>
      apiRequest(() =>
        api.GET('/api/listings/{id}/valuation', { params: { path: { id: listingId ?? '' } } }),
      ),
    enabled: listingId !== undefined && listingId.length > 0,
    retry: false,
    // The figure changes only when the listing or the model does, and both are
    // rare; refetching on every mount would call the model for nothing.
    staleTime: 5 * 60 * 1000,
  });
}
