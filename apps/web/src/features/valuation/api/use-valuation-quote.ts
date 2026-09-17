import {
  useMutation,
  useQuery,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import type { ModelAccuracy, ValuationQuote, ValuationQuoteRequest } from '@smartestate/contracts';
import type { ApiError } from '../../../shared/api/api-error.js';
import { api } from '../../../shared/api/client.js';
import { apiRequest } from '../../../shared/api/request.js';

/**
 * Valuing a property the reader describes, rather than one in the catalogue.
 *
 * A mutation rather than a query: the reader fills in a form and presses a
 * button, and nothing should reach the model until they say the description is
 * finished. Recomputing on every keystroke would call it once per digit of a
 * price and make the verdict flicker while they are still typing.
 */
export function useValuationQuote(): UseMutationResult<
  ValuationQuote,
  ApiError,
  ValuationQuoteRequest
> {
  return useMutation({
    mutationFn: (body: ValuationQuoteRequest) =>
      apiRequest(() => api.POST('/api/valuation/quote', { body })),
    retry: false,
  });
}

/**
 * What the model measured about itself.
 *
 * Read rather than written into the copy, so a published accuracy figure cannot
 * survive the retrain that invalidates it. A failure is not a failure of the
 * page: the FAQ answers without the numbers when they cannot be fetched.
 */
export function useModelAccuracy(): UseQueryResult<ModelAccuracy, ApiError> {
  return useQuery({
    queryKey: ['valuation', 'model'],
    queryFn: () => apiRequest(() => api.GET('/api/valuation/model')),
    retry: false,
    staleTime: 60 * 60 * 1000,
  });
}
