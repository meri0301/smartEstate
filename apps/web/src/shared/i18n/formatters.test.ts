import { describe, expect, it } from 'vitest';
import {
  formatAmd,
  formatDate,
  formatList,
  formatNumber,
  formatPercent,
  formatRelativeTime,
} from './formatters.js';

/**
 * Locale data groups digits with ordinary, non-breaking or narrow no-break
 * spaces depending on the language, and CLDR changes which it uses between
 * releases. Comparisons strip all of them and assert on digits and symbols, so
 * these tests pin behaviour rather than one ICU version. The codes are listed
 * numerically because the characters themselves are invisible in source.
 */
const SPACE_CODES = [0x20, 0xa0, 0x2009, 0x202f];
const squash = (value: string): string =>
  SPACE_CODES.reduce((out, code) => out.replaceAll(String.fromCharCode(code), ''), value);

describe('formatAmd', () => {
  it('uses the dram sign rather than the currency code', () => {
    for (const locale of ['hy', 'ru', 'en'] as const) {
      expect(formatAmd(45_000_000, locale)).toContain('֏');
      expect(formatAmd(45_000_000, locale)).not.toContain('AMD');
    }
  });

  it('groups digits the way each language does and drops minor units', () => {
    expect(squash(formatAmd(45_000_000, 'hy'))).toBe('45000000֏');
    expect(squash(formatAmd(45_000_000, 'ru'))).toBe('45000000֏');
    expect(squash(formatAmd(45_000_000, 'en'))).toBe('֏45,000,000');
  });

  it('abbreviates large sums on request', () => {
    const compact = formatAmd(45_000_000, 'en', { compact: true });
    expect(compact.length).toBeLessThan(formatAmd(45_000_000, 'en').length);
    expect(compact).toContain('֏');
  });
});

describe('unit formatting', () => {
  // Units themselves are translated strings, not formatter output: see the
  // "area", "pricePerSqm" and "meters" keys in the listings catalogue.
  it('shows the sign on a deviation percentage', () => {
    expect(formatPercent(-0.12, 'en')).toBe('-12%');
    expect(formatPercent(0.12, 'en')).toBe('+12%');
    expect(formatPercent(0, 'en')).toBe('0%');
  });

  it('formats plain numbers per locale', () => {
    expect(squash(formatNumber(1234.5, 'en', { maximumFractionDigits: 1 }))).toBe('1,234.5');
    expect(squash(formatNumber(1234.5, 'ru', { maximumFractionDigits: 1 }))).toBe('1234,5');
  });
});

describe('dates', () => {
  const date = new Date('2026-09-01T12:00:00.000Z');

  it('writes the month in the reader’s language', () => {
    expect(formatDate(date, 'hy', 'long')).toMatch(/սեպտեմբեր/);
    expect(formatDate(date, 'ru', 'long')).toMatch(/сентябр/);
    expect(formatDate(date, 'en', 'long')).toContain('September');
  });

  it('accepts an ISO string as well as a Date', () => {
    expect(formatDate('2026-09-01T12:00:00.000Z', 'en', 'long')).toBe(
      formatDate(date, 'en', 'long'),
    );
  });

  it('describes recency in words', () => {
    const now = new Date('2026-09-04T12:00:00.000Z');
    expect(formatRelativeTime(date, 'en', now)).toBe('3 days ago');
    expect(formatRelativeTime(date, 'hy', now)).toContain('օր');
    expect(formatRelativeTime(date, 'ru', now)).toContain('дн');
  });

  it('picks the largest unit that fits', () => {
    const now = new Date('2026-09-01T14:30:00.000Z');
    expect(formatRelativeTime(date, 'en', now)).toBe('2 hours ago');
    expect(formatRelativeTime(new Date('2026-09-01T12:29:00.000Z'), 'en', now)).toBe('2 hours ago');
    expect(formatRelativeTime(new Date('2025-09-01T12:00:00.000Z'), 'en', now)).toBe('last year');
  });
});

describe('formatList', () => {
  it('joins with the language’s own conjunction', () => {
    expect(formatList(['Kentron', 'Arabkir', 'Avan'], 'en')).toBe('Kentron, Arabkir, and Avan');
    expect(formatList(['Кентрон', 'Арабкир'], 'ru')).toContain('и');
    expect(formatList(['Կենտրոն', 'Արաբկիր'], 'hy')).toContain('Արաբկիր');
  });
});
