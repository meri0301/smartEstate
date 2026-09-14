import { DEFAULT_LOCALE, FALLBACK_LOCALE, LOCALES, type Locale } from '@smartestate/contracts';

export { DEFAULT_LOCALE, FALLBACK_LOCALE, LOCALES, type Locale };

export interface LocaleDescriptor {
  readonly locale: Locale;
  /** Name of the language written in that language, for the switcher. */
  readonly nativeName: string;
  /** BCP 47 tag passed to `Intl`; the region decides separators and date order. */
  readonly intlTag: string;
  readonly dir: 'ltr';
}

/**
 * The three shipped languages. Armenian is the default because the product is
 * built for the Armenian market; English is the fallback because it is the
 * language every string is authored in first.
 */
export const LOCALE_DESCRIPTORS: readonly LocaleDescriptor[] = [
  { locale: 'hy', nativeName: 'Հայերեն', intlTag: 'hy-AM', dir: 'ltr' },
  { locale: 'ru', nativeName: 'Русский', intlTag: 'ru-RU', dir: 'ltr' },
  { locale: 'en', nativeName: 'English', intlTag: 'en-US', dir: 'ltr' },
];

const BY_LOCALE = new Map(LOCALE_DESCRIPTORS.map((entry) => [entry.locale, entry]));

export function describeLocale(locale: Locale): LocaleDescriptor {
  const descriptor = BY_LOCALE.get(locale);
  if (descriptor === undefined) {
    throw new Error(`Unsupported locale: ${locale}`);
  }
  return descriptor;
}

/** BCP 47 tag for `Intl`. `hy` alone would not pick Armenian number separators. */
export function intlTag(locale: Locale): string {
  return describeLocale(locale).intlTag;
}

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

/**
 * Narrows a language tag to a supported locale, so `ru-RU`, `RU` and `ru` all
 * resolve to `ru`. Returns undefined rather than guessing.
 */
export function normaliseLocale(tag: string | null | undefined): Locale | undefined {
  const base = tag?.trim().toLowerCase().split(/[-_]/)[0];
  return isLocale(base) ? base : undefined;
}
