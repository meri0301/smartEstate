import { describe, expect, it, vi } from 'vitest';
import {
  detectLocale,
  LOCALE_STORAGE_KEY,
  localeFromPath,
  storeLocale,
  withLocalePath,
} from './detect.js';
import { isLocale, normaliseLocale } from './locales.js';

describe('normaliseLocale', () => {
  it('narrows a language tag to a supported locale', () => {
    expect(normaliseLocale('ru-RU')).toBe('ru');
    expect(normaliseLocale('HY')).toBe('hy');
    expect(normaliseLocale('en_US')).toBe('en');
  });

  it('returns undefined rather than guessing', () => {
    expect(normaliseLocale('de')).toBeUndefined();
    expect(normaliseLocale('')).toBeUndefined();
    expect(normaliseLocale(null)).toBeUndefined();
  });
});

describe('localeFromPath', () => {
  it('reads the first segment when it is a locale', () => {
    expect(localeFromPath('/hy/listings/123')).toBe('hy');
    expect(localeFromPath('/ru')).toBe('ru');
  });

  it('ignores a first segment that is not a locale', () => {
    expect(localeFromPath('/listings/123')).toBeUndefined();
    expect(localeFromPath('/')).toBeUndefined();
    expect(localeFromPath(undefined)).toBeUndefined();
  });
});

describe('withLocalePath', () => {
  it('inserts the locale when the path has none', () => {
    expect(withLocalePath('/listings/123', 'hy')).toBe('/hy/listings/123');
    expect(withLocalePath('/', 'en')).toBe('/en');
  });

  it('replaces an existing locale, keeping the rest of the path', () => {
    expect(withLocalePath('/hy/listings/123', 'ru')).toBe('/ru/listings/123');
    expect(withLocalePath('/en', 'hy')).toBe('/hy');
  });

  it('replaces a language we do not support instead of keeping it as a path segment', () => {
    expect(withLocalePath('/de/listings', 'hy')).toBe('/hy/listings');
    expect(withLocalePath('/pt-BR/listings', 'hy')).toBe('/hy/listings');
  });

  it('keeps an ordinary first segment', () => {
    expect(withLocalePath('/listings', 'hy')).toBe('/hy/listings');
    expect(withLocalePath('/favourites/compare', 'ru')).toBe('/ru/favourites/compare');
  });
});

describe('detectLocale', () => {
  const storageWith = (value: string | null) => ({ getItem: () => value });

  it('prefers the URL, so a shared link opens in the language it was shared in', () => {
    const result = detectLocale({
      pathname: '/ru/listings',
      profileLocale: 'en',
      storage: storageWith('hy'),
      acceptLanguages: ['en-GB'],
    });
    expect(result).toEqual({ locale: 'ru', source: 'url' });
  });

  it('falls back through profile, storage and the browser in order', () => {
    expect(
      detectLocale({ profileLocale: 'en', storage: storageWith('hy'), acceptLanguages: ['ru'] }),
    ).toEqual({ locale: 'en', source: 'profile' });

    expect(detectLocale({ storage: storageWith('hy'), acceptLanguages: ['ru'] })).toEqual({
      locale: 'hy',
      source: 'storage',
    });

    expect(detectLocale({ acceptLanguages: ['de-DE', 'ru-RU'] })).toEqual({
      locale: 'ru',
      source: 'browser',
    });
  });

  it('defaults to Armenian when nothing else applies', () => {
    expect(detectLocale({})).toEqual({ locale: 'hy', source: 'default' });
    expect(detectLocale({ acceptLanguages: ['de', 'fr'] })).toEqual({
      locale: 'hy',
      source: 'default',
    });
  });

  it('ignores unusable storage instead of failing', () => {
    const blocked = {
      getItem: () => {
        throw new Error('blocked');
      },
    };
    expect(detectLocale({ storage: blocked, acceptLanguages: ['en'] }).locale).toBe('en');
  });

  it('ignores a stored value that is no longer a supported locale', () => {
    expect(detectLocale({ storage: storageWith('de') }).source).toBe('default');
  });
});

describe('storeLocale', () => {
  it('writes under the documented key and tolerates failure', () => {
    const setItem = vi.fn();
    storeLocale({ setItem }, 'ru');
    expect(setItem).toHaveBeenCalledWith(LOCALE_STORAGE_KEY, 'ru');
    expect(() => {
      storeLocale(
        {
          setItem: () => {
            throw new Error('quota');
          },
        },
        'ru',
      );
    }).not.toThrow();
  });
});

describe('isLocale', () => {
  it('guards the supported set', () => {
    expect(isLocale('hy')).toBe(true);
    expect(isLocale('de')).toBe(false);
    expect(isLocale(7)).toBe(false);
  });
});
