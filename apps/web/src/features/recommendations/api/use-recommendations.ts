import { useMutation, type UseMutationResult } from '@tanstack/react-query';
import type { RecommendationRequestInput, RecommendationResponse } from '@smartestate/contracts';
import { anonymousHeaders } from '../../../shared/api/anonymous-id.js';
import type { ApiError } from '../../../shared/api/api-error.js';
import { api } from '../../../shared/api/client.js';
import { apiRequest } from '../../../shared/api/request.js';

/**
 * Asking the recommender for a ranking.
 *
 * A mutation because every call is an exposure: it is logged as a session and,
 * under an experiment, assigned to an arm. Re-running it on window focus would
 * inflate the session count for nobody's benefit, so it runs when the reader
 * asks and not otherwise.
 *
 * The anonymous id travels as a header so an unsigned browser is one subject
 * across visits rather than a new one per request. Without it the server would
 * be right to record no arm at all.
 */
export function useRecommendations(): UseMutationResult<
  RecommendationResponse,
  ApiError,
  RecommendationRequestInput
> {
  return useMutation({
    mutationFn: (body: RecommendationRequestInput) =>
      apiRequest(() => api.POST('/api/recommendations', { body, headers: anonymousHeaders() })),
    retry: false,
  });
}
