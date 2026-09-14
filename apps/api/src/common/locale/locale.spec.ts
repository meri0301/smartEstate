import { describe, expect, it } from 'vitest';
import { parseAcceptLanguage, pickTranslation, resolveLocale } from './locale.js';

describe('parseAcceptLanguage', () => {
  it('orders tags by quality, keeping header order for ties', () => {
    expect(parseAcceptLanguage('ru;q=0.8, hy, en;q=0.9')).toEqual(['hy', 'en', 'ru']);
  });

  it('drops rejected and malformed entries', () => {
    expect(parseAcceptLanguage('fr;q=0, de;q=abc, *;q=0.1')).toEqual(['*']);
    expect(parseAcceptLanguage(undefined)).toEqual([]);
  });
});

describe('resolveLocale', () => {
  it('prefers the explicit query parameter', () => {
    expect(resolveLocale({ query: 'ru', userLocale: 'en', acceptLanguage: 'hy' })).toBe('ru');
  });

  it('ignores unsupported query values and falls back to the user preference', () => {
    expect(resolveLocale({ query: 'fr', userLocale: 'en', acceptLanguage: 'hy' })).toBe('en');
  });

  it('uses Accept-Language, matching region-qualified tags', () => {
    expect(resolveLocale({ acceptLanguage: 'de-DE, ru-RU;q=0.9' })).toBe('ru');
  });

  it('defaults to Armenian', () => {
    expect(resolveLocale({})).toBe('hy');
    expect(resolveLocale({ acceptLanguage: 'fr, de' })).toBe('hy');
  });
});

describe('pickTranslation', () => {
  const translations = [
    { locale: 'hy', title: 'Հայերեն' },
    { locale: 'en', title: 'English' },
  ] as const;

  it('returns the requested locale when available', () => {
    expect(pickTranslation(translations, 'hy')?.title).toBe('Հայերեն');
  });

  it('falls back to English, then to anything available', () => {
    expect(pickTranslation(translations, 'ru')?.title).toBe('English');
    expect(pickTranslation([{ locale: 'ru', title: 'Русский' }] as const, 'hy')?.title).toBe(
      'Русский',
    );
  });

  it('records the locale that was requested', () => {
    expect(pickTranslation(translations, 'ru')?.requestedLocale).toBe('ru');
  });

  it('returns undefined when nothing exists', () => {
    const none: { locale: 'hy' | 'ru' | 'en'; title: string }[] = [];
    expect(pickTranslation(none, 'hy')).toBeUndefined();
  });
});
