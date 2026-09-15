/**
 * A stable identity for a browser nobody has signed in on.
 *
 * The A/B harness needs a subject to be sticky to and the feedback stream
 * needs one to attribute to; without an account, the browser itself is the
 * best available. The id is random, means nothing, and is sent as a header on
 * the two requests that need it — never in a URL, where it would end up in
 * logs and shared links.
 *
 * Storage can be unavailable (private windows, cleared data, thumbnail
 * renders), so every access is guarded and a session-only id is the fallback:
 * the experiment loses stickiness across visits for that browser, which is the
 * honest outcome, rather than the page failing.
 */

export const ANONYMOUS_ID_HEADER = 'x-anonymous-id';
const STORAGE_KEY = 'smartestate.anonymous-id';

let sessionOnly: string | undefined;

function mint(): string {
  return globalThis.crypto.randomUUID();
}

/** The browser's id, created on first use and reused thereafter. */
export function anonymousId(): string {
  try {
    const stored = globalThis.localStorage.getItem(STORAGE_KEY);
    if (stored !== null && stored !== '') {
      return stored;
    }
    const fresh = mint();
    globalThis.localStorage.setItem(STORAGE_KEY, fresh);
    return fresh;
  } catch {
    sessionOnly ??= mint();
    return sessionOnly;
  }
}

/** The header to attach to a request that needs a subject. */
export function anonymousHeaders(): Record<string, string> {
  return { [ANONYMOUS_ID_HEADER]: anonymousId() };
}
