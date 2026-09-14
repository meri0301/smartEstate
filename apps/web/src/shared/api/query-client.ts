import { QueryClient } from '@tanstack/react-query';
import { ApiError } from './api-error.js';

/**
 * Server-state defaults. Client errors (4xx) are final and never retried;
 * network and server errors get two retries with back-off. Data is considered
 * fresh for 30 s, which covers the search → detail → back navigation pattern.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: (failureCount, error) => shouldRetry(failureCount, error),
        refetchOnWindowFocus: false,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (failureCount >= 2) {
    return false;
  }
  if (ApiError.isApiError(error)) {
    return error.statusCode === 0 || error.statusCode >= 500;
  }
  return true;
}
