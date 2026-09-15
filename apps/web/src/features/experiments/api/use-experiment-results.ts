import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { Experiment, ExperimentResults } from '@smartestate/contracts';
import type { ApiError } from '../../../shared/api/api-error.js';
import { api } from '../../../shared/api/client.js';
import { apiRequest } from '../../../shared/api/request.js';

/** Every defined experiment. Changes when somebody inserts a row, which is rarely. */
export function useExperiments(): UseQueryResult<Experiment[], ApiError> {
  return useQuery({
    queryKey: ['experiments'],
    queryFn: () => apiRequest(() => api.GET('/api/experiments')),
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Per-arm outcomes for one experiment.
 *
 * A plain query: the answer is a function of the address and the database,
 * so arriving at the page is enough to ask. It is recomputed from the stored
 * sessions on every call rather than cached server-side, which is right for a
 * results page somebody refreshes to see the count move.
 */
export function useExperimentResults(
  key: string | undefined,
  k?: number,
): UseQueryResult<ExperimentResults, ApiError> {
  return useQuery({
    queryKey: ['experiments', key, 'results', k],
    enabled: key !== undefined && key !== '',
    retry: false,
    queryFn: () =>
      apiRequest(() =>
        api.GET('/api/experiments/{key}/results', {
          params: { path: { key: key ?? '' }, query: k === undefined ? {} : { k } },
        }),
      ),
  });
}
