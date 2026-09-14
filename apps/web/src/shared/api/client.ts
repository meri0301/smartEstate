import createClient, { type Client, type Middleware } from 'openapi-fetch';
import type { paths } from './schema.js';
import { sessionStore } from './session-store.js';

/**
 * Typed fetch client generated from the API's OpenAPI document: every path,
 * parameter and response body is checked at compile time. Cookies travel with
 * every request (`credentials: 'include'`) so the httpOnly refresh cookie reaches
 * `/api/auth/refresh`.
 *
 * `VITE_API_BASE_URL` is empty in development (Vite proxies `/api` to :3000) and
 * in the single-origin Docker deployment; set it only when the API lives elsewhere.
 */
export type ApiClient = Client<paths>;

export interface ClientOptions {
  baseUrl?: string;
  fetch?: typeof globalThis.fetch;
  getAccessToken?: () => string | null;
}

/** Resolved per call so test doubles installed on globalThis after start-up are honoured. */
const lazyFetch: typeof fetch = (input, init) => globalThis.fetch(input, init);

export function createApiClient(options: ClientOptions = {}): ApiClient {
  const getAccessToken = options.getAccessToken ?? sessionStore.getAccessToken;
  const client = createClient<paths>({
    baseUrl: options.baseUrl ?? '',
    credentials: 'include',
    // Resolved per call so test doubles installed on globalThis after start-up are honoured.
    fetch: options.fetch ?? lazyFetch,
  });

  const bearer: Middleware = {
    onRequest({ request }) {
      const token = getAccessToken();
      if (token !== null && !request.headers.has('authorization')) {
        request.headers.set('authorization', `Bearer ${token}`);
      }
      return request;
    },
  };
  client.use(bearer);
  return client;
}

/**
 * Explicit origin from the environment, otherwise the page's own origin (same-origin
 * deployment, Vite proxy in development). A concrete origin is required because
 * `Request` rejects relative URLs outside a browser document context.
 */
function readBaseUrl(): string {
  const value: unknown = import.meta.env.VITE_API_BASE_URL;
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }
  return typeof window === 'undefined' ? '' : window.location.origin;
}

/** Application-wide client bound to the session store. */
export const api: ApiClient = createApiClient({ baseUrl: readBaseUrl() });
