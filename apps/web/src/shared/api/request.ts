import { networkError, toApiError } from './api-error.js';
import type { ApiClient } from './client.js';
import { refreshSession } from './session.js';

/** The `{ data, error, response }` triple every openapi-fetch operation resolves to. */
export interface OperationResult<TData> {
  data?: TData;
  error?: unknown;
  response: Response;
}

export interface RequestOptions {
  /** Refresh the session and replay once on 401. Off for the auth routes themselves. */
  retryOnUnauthorized?: boolean;
  client?: ApiClient;
}

/**
 * Executes an operation and unwraps its data, converting failures into
 * `ApiError`. On 401 the session is refreshed once and the operation replayed;
 * replaying the *operation* (not the consumed `Request`) sidesteps body-stream
 * reuse problems and keeps the retry logic in one place.
 */
export async function apiRequest<TData>(
  operation: () => Promise<OperationResult<TData>>,
  options: RequestOptions = {},
): Promise<TData> {
  const retry = options.retryOnUnauthorized ?? true;
  let result = await run(operation);

  if (result.response.status === 401 && retry) {
    const token = await refreshSession(options.client);
    if (token !== null) {
      result = await run(operation);
    }
  }

  if (!result.response.ok) {
    throw toApiError(result.response.status, result.error);
  }
  // 204 No Content resolves with no body; callers typed as void receive undefined.
  return result.data as TData;
}

async function run<TData>(
  operation: () => Promise<OperationResult<TData>>,
): Promise<OperationResult<TData>> {
  try {
    return await operation();
  } catch (cause) {
    throw networkError(cause);
  }
}
