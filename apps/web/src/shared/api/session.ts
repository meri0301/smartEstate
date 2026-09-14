import { api, type ApiClient } from './client.js';
import { sessionStore } from './session-store.js';

let inflight: Promise<string | null> | null = null;

/**
 * Exchanges the httpOnly refresh cookie for a new access token. Concurrent
 * callers share one request (single flight) so a burst of 401s after token
 * expiry never triggers several rotations, which would trip the API's reuse
 * detection. Resolves to the new token, or null when the session is gone.
 */
export function refreshSession(client: ApiClient = api): Promise<string | null> {
  inflight ??= (async (): Promise<string | null> => {
    try {
      const { data, response } = await client.POST('/api/auth/refresh');
      if (response.ok && data !== undefined) {
        sessionStore.setSession(data);
        return data.accessToken;
      }
      sessionStore.clearSession();
      return null;
    } catch {
      // Network failure: keep whatever state we had rather than logging the user out.
      return null;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}
