import { useMutation, type UseMutationResult } from '@tanstack/react-query';
import type { MortgageRefund, MortgageRefundRequestInput } from '@smartestate/contracts';
import type { ApiError } from '../../../shared/api/api-error.js';
import { api } from '../../../shared/api/client.js';
import { apiRequest } from '../../../shared/api/request.js';

/**
 * Working out the refund.
 *
 * A mutation rather than a query, because the reader presses a button. A
 * calculator that recomputed on every keystroke would send a request per digit
 * of a price, and the answer is not something anybody wants to watch flicker
 * while they type a seven-figure number.
 */
export function useMortgageRefund(): UseMutationResult<
  MortgageRefund,
  ApiError,
  MortgageRefundRequestInput
> {
  return useMutation({
    mutationFn: (body: MortgageRefundRequestInput) =>
      apiRequest(() => api.POST('/api/mortgage/refund', { body })),
    retry: false,
  });
}
