import { describe, expect, it } from 'vitest';
import {
  chooseTranslation,
  embeddableText,
  MAX_EMBEDDED_CHARS,
  textHash,
  type TranslationText,
} from './embedding-text.js';

const translation = (overrides: Partial<TranslationText> = {}): TranslationText => ({
  locale: 'hy',
  title: 'Լուսավոր բնակարան',
  description: 'Հանգիստ փողոց, կանաչ բակ։',
  source: 'HUMAN',
  ...overrides,
});

describe('chooseTranslation', () => {
  it('prefers text a person wrote over a translation of it', () => {
    // Embedding a machine translation compounds whatever the first pass lost.
    const chosen = chooseTranslation([
      translation({ locale: 'hy', source: 'MACHINE' }),
      translation({ locale: 'en', source: 'HUMAN', title: 'Bright flat' }),
    ]);

    expect(chosen?.locale).toBe('en');
  });

  it('prefers the default locale among equals', () => {
    const chosen = chooseTranslation([
      translation({ locale: 'en', title: 'Bright flat' }),
      translation({ locale: 'hy' }),
      translation({ locale: 'ru', title: 'Светлая квартира' }),
    ]);

    expect(chosen?.locale).toBe('hy');
  });

  it('chooses the same translation whatever order the rows arrive in', () => {
    // An unstable choice would churn the hash and re-embed the catalogue on no
    // change at all.
    const rows = [
      translation({ locale: 'ru', title: 'Светлая квартира' }),
      translation({ locale: 'en', title: 'Bright flat' }),
      translation({ locale: 'hy' }),
    ];

    expect(chooseTranslation(rows)?.locale).toBe(chooseTranslation([...rows].reverse())?.locale);
  });

  it('skips a translation with no text at all', () => {
    const chosen = chooseTranslation([
      translation({ locale: 'hy', title: '   ', description: '' }),
      translation({ locale: 'ru', title: 'Светлая квартира' }),
    ]);

    expect(chosen?.locale).toBe('ru');
  });

  it('returns nothing for a listing with nothing to say', () => {
    expect(chooseTranslation([])).toBeUndefined();
    expect(chooseTranslation([translation({ title: '', description: '' })])).toBeUndefined();
  });
});

describe('embeddableText', () => {
  it('joins the title and the description', () => {
    expect(embeddableText(translation({ title: 'A', description: 'B' }))).toBe('A\nB');
  });

  it('carries the prose and nothing else', () => {
    // Rooms, area and district are exact filters already. Putting them in the
    // vector as well would let a fuzzy match argue with an exact constraint.
    const text = embeddableText(translation({ title: 'Bright flat', description: 'Quiet street' }));

    expect(text).toBe('Bright flat\nQuiet street');
  });

  it('truncates to what will actually be encoded', () => {
    const text = embeddableText(translation({ description: 'x'.repeat(5_000) }));

    expect(text).toHaveLength(MAX_EMBEDDED_CHARS);
  });

  it('copes with a missing description', () => {
    expect(embeddableText(translation({ description: '' }))).toBe('Լուսավոր բնակարան');
  });
});

describe('textHash', () => {
  it('is the same for the same text', () => {
    expect(textHash('hy', 'a flat')).toBe(textHash('hy', 'a flat'));
  });

  it('changes when the text changes', () => {
    expect(textHash('hy', 'a flat')).not.toBe(textHash('hy', 'a flat.'));
  });

  it('changes when the chosen locale changes', () => {
    // A listing that gained a human Armenian title should be re-embedded even if
    // the English text it had been using is word for word the same.
    expect(textHash('hy', 'a flat')).not.toBe(textHash('en', 'a flat'));
  });
});
