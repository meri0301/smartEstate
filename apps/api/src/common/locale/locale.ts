import { DEFAULT_LOCALE, FALLBACK_LOCALE, LOCALES, type Locale } from '@smartestate/contracts';

const SUPPORTED = new Set<string>(LOCALES);

function asLocale(value: string | undefined): Locale | undefined {
  const tag = value?.trim().toLowerCase().split('-')[0];
  return tag !== undefined && SUPPORTED.has(tag) ? (tag as Locale) : undefined;
}

/**
 * Resolves the response locale with the precedence defined for the product:
 * explicit query parameter → authenticated user's preference → Accept-Language →
 * default (Armenian).
 */
export function resolveLocale(input: {
  query?: string | undefined;
  userLocale?: Locale | undefined;
  acceptLanguage?: string | undefined;
}): Locale {
  const fromQuery = asLocale(input.query);
  if (fromQuery !== undefined) {
    return fromQuery;
  }
  if (input.userLocale !== undefined) {
    return input.userLocale;
  }
  for (const candidate of parseAcceptLanguage(input.acceptLanguage)) {
    const locale = asLocale(candidate);
    if (locale !== undefined) {
      return locale;
    }
  }
  return DEFAULT_LOCALE;
}

/** Language tags from an Accept-Language header, best quality first. */
export function parseAcceptLanguage(header: string | undefined): string[] {
  if (header === undefined || header.trim().length === 0) {
    return [];
  }
  return header
    .split(',')
    .map((part, index) => {
      const [tag, ...params] = part.trim().split(';');
      const q = params
        .map((p) => p.trim())
        .find((p) => p.startsWith('q='))
        ?.slice(2);
      const quality = q === undefined ? 1 : Number(q);
      return { tag: (tag ?? '').trim(), quality: Number.isFinite(quality) ? quality : 0, index };
    })
    .filter((entry) => entry.tag.length > 0 && entry.quality > 0)
    .sort((a, b) => b.quality - a.quality || a.index - b.index)
    .map((entry) => entry.tag);
}

/**
 * Picks the translation for the requested locale, falling back to English and
 * then to whatever exists. Returns the locale actually used so the client can
 * show a "translated from" hint.
 */
export function pickTranslation<T extends { locale: Locale }>(
  translations: readonly T[],
  requested: Locale,
): (T & { requestedLocale: Locale }) | undefined {
  const order: Locale[] = [requested, FALLBACK_LOCALE, ...LOCALES];
  for (const locale of order) {
    const match = translations.find((t) => t.locale === locale);
    if (match !== undefined) {
      return { ...match, requestedLocale: requested };
    }
  }
  return undefined;
}
