import { useMutation, type UseMutationResult } from '@tanstack/react-query';
import type { ValuationQuote, ValuationQuoteRequest } from '@smartestate/contracts';
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
