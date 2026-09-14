import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { District, DistrictBoundaryResponse } from '@smartestate/contracts';
import type { ApiError } from '../../../shared/api/api-error.js';
import { api } from '../../../shared/api/client.js';
import { queryKeys } from '../../../shared/api/query-keys.js';
import { apiRequest } from '../../../shared/api/request.js';

/** Reference data that changes only with a reseed; cached for the session. */
export function useDistricts(): UseQueryResult<District[], ApiError> {
  return useQuery({
    queryKey: queryKeys.geo.districts,
    queryFn: () => apiRequest(() => api.GET('/api/districts')),
    staleTime: Number.POSITIVE_INFINITY,
  });
}

export function useDistrictBoundary(
  slug: string | undefined,
): UseQueryResult<DistrictBoundaryResponse, ApiError> {
  return useQuery({
    queryKey: queryKeys.geo.boundary(slug ?? ''),
    queryFn: () =>
      apiRequest(() =>
        api.GET('/api/districts/{slug}/boundary', { params: { path: { slug: slug ?? '' } } }),
      ),
    enabled: slug !== undefined && slug.length > 0,
    staleTime: Number.POSITIVE_INFINITY,
  });
}
