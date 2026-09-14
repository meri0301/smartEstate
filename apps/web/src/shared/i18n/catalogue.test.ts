import { describe, expect, it } from 'vitest';
import {
  catalogueFor,
  checkCatalogue,
  checkLocale,
  flatten,
  formatProblems,
  pluralBlocks,
} from './catalogue.js';
import { LOCALES } from './locales.js';

describe('flatten', () => {
  it('joins nested keys with dots', () => {
    expect([...flatten({ nav: { search: 'a', deep: { x: 'b' } }, top: 'c' })]).toEqual([
      ['nav.search', 'a'],
      ['nav.deep.x', 'b'],
      ['top', 'c'],
    ]);
  });
});

describe('pluralBlocks', () => {
  it('finds the categories a block defines', () => {
    const [block] = pluralBlocks('{count, plural, one {# room} other {# rooms}}');
    expect([...(block?.categories ?? [])].sort()).toEqual(['one', 'other']);
  });

  it('records explicit exact matches alongside categories', () => {
    const [block] = pluralBlocks('{count, plural, =0 {none} one {# x} other {# y}}');
    expect(block?.categories.has('=0')).toBe(true);
    expect(block?.categories.has('one')).toBe(true);
  });

  it('finds nested plural blocks', () => {
    const blocks = pluralBlocks(
      '{a, plural, one {{b, plural, one {x} other {y}}} other {{b, plural, one {x} other {y}}}}',
    );
    expect(blocks.length).toBeGreaterThanOrEqual(3);
  });

  it('ignores ordinary interpolation', () => {
    expect(pluralBlocks('Floor {floor} of {total}')).toEqual([]);
  });

  it('survives an unbalanced message instead of looping', () => {
    expect(() => pluralBlocks('{count, plural, one {# x')).not.toThrow();
  });
});

describe('the shipped catalogue', () => {
  it('is complete, parseable and plural-correct in every language', () => {
    const problems = checkCatalogue();
    expect(problems, `\n${formatProblems(problems)}\n`).toEqual([]);
  });

  it('has the same key set in every language', () => {
    const reference = [...catalogueFor('en').keys()].sort();
    for (const locale of LOCALES) {
      expect([...catalogueFor(locale).keys()].sort(), locale).toEqual(reference);
    }
  });

  it('is not empty, so a passing check means something', () => {
    expect(catalogueFor('en').size).toBeGreaterThan(40);
  });
});

describe('checkLocale', () => {
  it('reports a Russian plural that omits few and many', () => {
    // Simulates a translator copying the English two-form shape into Russian.
    const problems = checkLocale('ru');
    expect(problems).toEqual([]);

    const categories = new Intl.PluralRules('ru').resolvedOptions().pluralCategories;
    expect(categories).toContain('few');
    expect(categories).toContain('many');
  });

  it('knows Armenian needs only two forms', () => {
    expect(new Intl.PluralRules('hy').resolvedOptions().pluralCategories.sort()).toEqual([
      'one',
      'other',
    ]);
  });
});

describe('formatProblems', () => {
  it('renders one readable line per problem', () => {
    const text = formatProblems([
      { locale: 'ru', key: 'listings:roomCount', kind: 'plural', detail: 'missing few' },
    ]);
    expect(text).toContain('ru');
    expect(text).toContain('listings:roomCount');
    expect(text).toContain('missing few');
  });
});
