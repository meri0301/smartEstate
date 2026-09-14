import { intlTag, type Locale } from './locales.js';

/**
 * Locale-aware formatting.
 *
 * `Intl` formatters are expensive to construct and are used on every row of a
 * result list, so each distinct configuration is built once and reused.
 */
const numberCache = new Map<string, Intl.NumberFormat>();
const dateCache = new Map<string, Intl.DateTimeFormat>();
const relativeCache = new Map<string, Intl.RelativeTimeFormat>();
const listCache = new Map<string, Intl.ListFormat>();

function numberFormat(locale: Locale, options: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = `${locale}:${JSON.stringify(options)}`;
  let formatter = numberCache.get(key);
  if (formatter === undefined) {
    formatter = new Intl.NumberFormat(intlTag(locale), options);
    numberCache.set(key, formatter);
  }
  return formatter;
}

export function formatNumber(
  value: number,
  locale: Locale,
  options: Intl.NumberFormatOptions = {},
): string {
  return numberFormat(locale, options).format(value);
}

export interface CurrencyOptions {
  /** Abbreviates large sums, e.g. 45 million dram rather than all eight digits. */
  compact?: boolean;
  /** Dram amounts are whole numbers in practice; set this to show minor units. */
  fractionDigits?: number;
}

/**
 * Armenian dram. `narrowSymbol` selects ֏ rather than the "AMD" code, which is
 * what the design shows and what people actually read.
 */
export function formatAmd(value: number, locale: Locale, options: CurrencyOptions = {}): string {
  return numberFormat(locale, {
    style: 'currency',
    currency: 'AMD',
    currencyDisplay: 'narrowSymbol',
    maximumFractionDigits: options.fractionDigits ?? 0,
    ...(options.compact === true ? { notation: 'compact', maximumFractionDigits: 1 } : {}),
  }).format(value);
}

/** Price per square metre, the comparison metric this market runs on. */
export function formatPricePerSqm(value: number, locale: Locale): string {
  return `${formatAmd(value, locale)}/m²`;
}

export function formatArea(value: number, locale: Locale): string {
  return `${formatNumber(value, locale, { maximumFractionDigits: 1 })} m²`;
}

export function formatPercent(value: number, locale: Locale, fractionDigits = 0): string {
  return numberFormat(locale, {
    style: 'percent',
    maximumFractionDigits: fractionDigits,
    signDisplay: 'exceptZero',
  }).format(value);
}

export type DateStyle = 'short' | 'medium' | 'long';

export function formatDate(
  value: Date | string,
  locale: Locale,
  style: DateStyle = 'medium',
): string {
  const key = `${locale}:${style}`;
  let formatter = dateCache.get(key);
  if (formatter === undefined) {
    formatter = new Intl.DateTimeFormat(intlTag(locale), { dateStyle: style });
    dateCache.set(key, formatter);
  }
  return formatter.format(typeof value === 'string' ? new Date(value) : value);
}

const RELATIVE_UNITS: readonly [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 60 * 60 * 1000],
  ['month', 30 * 24 * 60 * 60 * 1000],
  ['week', 7 * 24 * 60 * 60 * 1000],
  ['day', 24 * 60 * 60 * 1000],
  ['hour', 60 * 60 * 1000],
  ['minute', 60 * 1000],
];

/**
 * "3 days ago", in the reader's language. Used for listing publication dates,
 * where the exact timestamp matters less than the recency.
 */
export function formatRelativeTime(
  value: Date | string,
  locale: Locale,
  now: Date = new Date(),
): string {
  let formatter = relativeCache.get(locale);
  if (formatter === undefined) {
    formatter = new Intl.RelativeTimeFormat(intlTag(locale), { numeric: 'auto' });
    relativeCache.set(locale, formatter);
  }
  const target = typeof value === 'string' ? new Date(value) : value;
  const diff = target.getTime() - now.getTime();
  for (const [unit, ms] of RELATIVE_UNITS) {
    if (Math.abs(diff) >= ms) {
      return formatter.format(Math.round(diff / ms), unit);
    }
  }
  return formatter.format(Math.round(diff / 1000), 'second');
}

/** "Kentron, Arabkir and Avan", joined the way the language joins lists. */
export function formatList(items: readonly string[], locale: Locale): string {
  let formatter = listCache.get(locale);
  if (formatter === undefined) {
    formatter = new Intl.ListFormat(intlTag(locale), { style: 'long', type: 'conjunction' });
    listCache.set(locale, formatter);
  }
  return formatter.format(items);
}
