import {
  useMutation,
  useQuery,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import type { CreateReviewRequest, ProductStats, Review, ReviewList } from '@smartestate/contracts';
import type { ApiError } from '../../../shared/api/api-error.js';
import { api } from '../../../shared/api/client.js';
import { apiRequest } from '../../../shared/api/request.js';

/** How many reviews the carousel holds. More than this and the oldest fall off. */
export const REVIEW_PAGE_SIZE = 12;

export const reviewKeys = {
  list: ['reviews', 'list'] as const,
  stats: ['reviews', 'stats'] as const,
};

export function useReviews(): UseQueryResult<ReviewList, ApiError> {
  return useQuery({
    queryKey: reviewKeys.list,
    queryFn: () =>
      apiRequest(() => api.GET('/api/reviews', { params: { query: { limit: REVIEW_PAGE_SIZE } } })),
    retry: false,
  });
}

/**
 * What the product has actually done.
 *
 * Separate from the reviews because it is a different question with a different
 * lifetime: the counts move as the catalogue and the valuations do, not as
 * people write about them.
 */
export function useProductStats(): UseQueryResult<ProductStats, ApiError> {
  return useQuery({
    queryKey: reviewKeys.stats,
    queryFn: () => apiRequest(() => api.GET('/api/reviews/stats')),
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
}

export function useCreateReview(): UseMutationResult<Review, ApiError, CreateReviewRequest> {
  return useMutation({
    mutationFn: (body: CreateReviewRequest) => apiRequest(() => api.POST('/api/reviews', { body })),
    retry: false,
  });
}
