import { useMutation, type UseMutationResult } from '@tanstack/react-query';
import type { ParsedQuery } from '@smartestate/contracts';
import type { ApiError } from '../../../shared/api/api-error.js';
import { api } from '../../../shared/api/client.js';
import { apiRequest } from '../../../shared/api/request.js';

/**
 * Reads a typed sentence into filters.
 *
 * A mutation rather than a query: it is an action the reader takes, it is
 * rate-limited, and it must not re-run on its own. A failure is not retried,
 * because the deterministic parser already answers on the server side and a
 * request that failed outright will not do better a moment later.
 */
export function useParseQuery(): UseMutationResult<ParsedQuery, ApiError, string> {
  return useMutation({
    mutationFn: (query: string) =>
      apiRequest(() => api.POST('/api/search/parse', { body: { query } })),
    retry: false,
  });
}
