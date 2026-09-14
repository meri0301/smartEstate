import { DEFAULT_LOCALE, normaliseLocale, type Locale } from './locales.js';

export const LOCALE_STORAGE_KEY = 'se-locale';

export interface DetectionInput {
  /** Current path, e.g. `/hy/listings/123`. The first segment wins if it is a locale. */
  pathname?: string | undefined;
  /** Locale saved on the signed-in account. */
  profileLocale?: Locale | undefined;
  storage?: Pick<Storage, 'getItem'> | undefined;
  /** `navigator.languages`, or the value of an Accept-Language header. */
  acceptLanguages?: readonly string[] | undefined;
}

export interface DetectionResult {
  locale: Locale;
  /** Which rule decided, so the choice can be explained and tested. */
  source: 'url' | 'profile' | 'storage' | 'browser' | 'default';
}

/** Reads the locale from the first path segment, if it is one. */
export function localeFromPath(pathname: string | undefined): Locale | undefined {
  const first = pathname?.split('/').find((part) => part.length > 0);
  return normaliseLocale(first);
}

/**
 * A bare language tag: two letters, optionally with a region, such as `de` or
 * `pt-BR`. Used to tell a locale segment we do not support from an ordinary
 * path segment, so `/de/listings` becomes `/hy/listings` rather than
 * `/hy/de/listings`, while `/listings` keeps its segment.
 *
 * The application has no two-letter route names, so the ambiguity is theoretical.
 */
const LANGUAGE_TAG = /^[a-z]{2}(-[a-z]{2,4})?$/i;

/** Replaces or inserts the locale segment, preserving the rest of the path. */
export function withLocalePath(pathname: string, locale: Locale): string {
  const segments = pathname.split('/').filter((part) => part.length > 0);
  const first = segments[0];
  const replaces =
    first !== undefined && (normaliseLocale(first) !== undefined || LANGUAGE_TAG.test(first));
  const rest = replaces ? segments.slice(1) : segments;
  return `/${[locale, ...rest].join('/')}`;
}

function readStorage(storage: Pick<Storage, 'getItem'> | undefined): Locale | undefined {
  try {
    return normaliseLocale(storage?.getItem(LOCALE_STORAGE_KEY));
  } catch {
    // Private windows and blocked storage must not break language selection.
    return undefined;
  }
}

/**
 * Resolves the language to render in, in the order the product specifies:
 * the URL, then the signed-in account, then this browser's remembered choice,
 * then what the browser asks for, then Armenian.
 *
 * The URL comes first so a shared link always opens in the language it was
 * shared in, whatever the recipient's own settings say.
 */
export function detectLocale(input: DetectionInput): DetectionResult {
  const fromUrl = localeFromPath(input.pathname);
  if (fromUrl !== undefined) {
    return { locale: fromUrl, source: 'url' };
  }
  if (input.profileLocale !== undefined) {
    return { locale: input.profileLocale, source: 'profile' };
  }
  const stored = readStorage(input.storage);
  if (stored !== undefined) {
    return { locale: stored, source: 'storage' };
  }
  for (const tag of input.acceptLanguages ?? []) {
    const candidate = normaliseLocale(tag);
    if (candidate !== undefined) {
      return { locale: candidate, source: 'browser' };
    }
  }
  return { locale: DEFAULT_LOCALE, source: 'default' };
}

export function storeLocale(storage: Pick<Storage, 'setItem'> | undefined, locale: Locale): void {
  try {
    storage?.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // Remembering the choice is a convenience, not a requirement.
  }
}
