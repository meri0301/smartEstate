import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { HybridSearchResponse, Locale, ParsedFilters } from '@smartestate/contracts';
import type { ApiError } from '../../../shared/api/api-error.js';
import { api } from '../../../shared/api/client.js';
import { apiRequest } from '../../../shared/api/request.js';

/** How long a sentence's results are reused before the server is asked again. */
const STALE_MS = 5 * 60 * 1000;

export interface HybridSearchInput {
  query: string | undefined;
  /**
   * The filters the reader has settled on.
   *
   * Sent only when there are some. An empty object is a meaningful answer on the
   * wire — it says the reader cleared every chip — so sending one for a link
   * that has simply not been parsed yet would drop the sentence's own
   * constraints and return listings it had ruled out.
   */
  filters: ParsedFilters;
  locale: Locale;
  limit?: number;
}

/**
 * Searching by sentence.
 *
 * A query rather than a mutation, because the sentence lives in the URL: the
 * result is a function of the address, so arriving at a shared link has to run
 * the search without anybody pressing anything.
 *
 * It is deliberately quiet about refetching. Each call may embed the query,
 * which spends the shared model allowance, so a window regaining focus is not a
 * reason to spend it again, and a failure is not retried — the deterministic
 * half already answered on the server, and a request that failed outright will
 * not do better a moment later.
 */
export function useHybridSearch(
  input: HybridSearchInput,
): UseQueryResult<HybridSearchResponse, ApiError> {
  const { query, filters, locale, limit = 24 } = input;
  return useQuery({
    queryKey: ['search', 'hybrid', locale, query, filters, limit],
    enabled: query !== undefined && query.trim().length > 0,
    staleTime: STALE_MS,
    retry: false,
    refetchOnWindowFocus: false,
    queryFn: () =>
      apiRequest(() =>
        api.POST('/api/search/hybrid', {
          params: { query: { locale } },
          body: {
            query: query ?? '',
            limit,
            ...(Object.keys(filters).length === 0 ? {} : { filters }),
          },
        }),
      ),
  });
}
