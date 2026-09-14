import { describe, expect, it } from 'vitest';
import { createI18n } from './i18n.js';

/**
 * The plural rules are the part of this phase most likely to be wrong and least
 * likely to be noticed, so they are pinned against real rendered output rather
 * than against the rules in the abstract.
 */
describe('plural selection', () => {
  const hy = createI18n('hy');
  const ru = createI18n('ru');
  const en = createI18n('en');

  it('English uses two forms and an explicit zero', () => {
    expect(en.t('listings:resultCount', { count: 0 })).toBe('No listings');
    expect(en.t('listings:resultCount', { count: 1 })).toBe('1 listing');
    expect(en.t('listings:resultCount', { count: 2 })).toBe('2 listings');
    expect(en.t('listings:roomCount', { count: 1 })).toBe('1 room');
    expect(en.t('listings:roomCount', { count: 5 })).toBe('5 rooms');
  });

  it('Russian selects one, few and many correctly', () => {
    expect(ru.t('listings:roomCount', { count: 1 })).toBe('1 комната');
    expect(ru.t('listings:roomCount', { count: 2 })).toBe('2 комнаты');
    expect(ru.t('listings:roomCount', { count: 4 })).toBe('4 комнаты');
    expect(ru.t('listings:roomCount', { count: 5 })).toBe('5 комнат');
    expect(ru.t('listings:roomCount', { count: 11 })).toBe('11 комнат');
    // 21 returns to the singular in Russian, which a two-form scheme gets wrong.
    expect(ru.t('listings:roomCount', { count: 21 })).toBe('21 комната');
    expect(ru.t('listings:roomCount', { count: 0 })).toBe('0 комнат');
  });

  it('Armenian treats zero as singular', () => {
    // Unlike English, `hy` selects the `one` category for 0. The noun itself is
    // not inflected after a numeral, so both forms carry the same word, and the
    // rule only shows up in the category that is selected.
    expect(new Intl.PluralRules('hy').select(0)).toBe('one');
    expect(new Intl.PluralRules('en').select(0)).toBe('other');
    expect(hy.t('listings:roomCount', { count: 1 })).toBe('1 սենյակ');
    expect(hy.t('listings:roomCount', { count: 5 })).toBe('5 սենյակ');
    expect(hy.t('listings:resultCount', { count: 0 })).toBe('Հայտարարություններ չկան');
  });

  it('falls back to English for a key that is only authored there', () => {
    // Every key is translated, so the fallback is exercised with a missing one.
    expect(hy.t('common:brand')).toBe('SmartEstate');
  });

  it('interpolates non-plural placeholders in every language', () => {
    expect(en.t('listings:floorOf', { floor: 4, total: 9 })).toBe('Floor 4 of 9');
    expect(ru.t('listings:floorOf', { floor: 4, total: 9 })).toBe('4 этаж из 9');
    expect(hy.t('listings:floorOf', { floor: 4, total: 9 })).toBe('9-ից 4-րդ հարկ');
  });
});
