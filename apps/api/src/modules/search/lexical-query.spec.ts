import { describe, expect, it } from 'vitest';
import { MAX_TERMS, toLexicalQuery } from './lexical-query.js';

describe('toLexicalQuery', () => {
  it('joins the terms of a sentence with or, so a listing need not contain all of them', () => {
    // The AND that `websearch_to_tsquery` builds by default is what made this
    // arm return nothing for every real query.
    expect(toLexicalQuery('quiet bright flat')).toBe('quiet or bright or flat');
  });

  it('keeps Armenian and Russian terms', () => {
    expect(toLexicalQuery('հանգիստ բնակարան')).toBe('հանգիստ or բնակարան');
    expect(toLexicalQuery('светлая квартира')).toBe('светлая or квартира');
  });

  it('drops punctuation rather than passing it to the query parser', () => {
    expect(toLexicalQuery('2-room flat, near a school!')).toBe(
      '2 or room or flat or near or a or school',
    );
  });

  it('removes the words that would change the query’s structure', () => {
    // One stray "and" in the middle of a disjunction empties the result set.
    expect(toLexicalQuery('bright and quiet or not noisy')).toBe('bright or quiet or noisy');
  });

  it('lowercases, because the query and the index agree on case and nothing else', () => {
    expect(toLexicalQuery('Arabkir KENTRON')).toBe('arabkir or kentron');
  });

  it('keeps digits and the unit beside them, which is how a title is matched', () => {
    // Titles read "2-room apartment in Arabkir, 63.1 m²", so the superscript is
    // part of a real term rather than punctuation to discard.
    expect(toLexicalQuery('72 m²')).toBe('72 or m²');
  });

  it('bounds a paste rather than building a query out of it', () => {
    const many = Array.from({ length: MAX_TERMS + 10 }, (_unused, index) => `w${String(index)}`);

    expect(toLexicalQuery(many.join(' '))?.split(' or ')).toHaveLength(MAX_TERMS);
  });

  it('asks nothing when there is nothing to ask', () => {
    expect(toLexicalQuery('!!! ... ???')).toBeUndefined();
    expect(toLexicalQuery('   ')).toBeUndefined();
    expect(toLexicalQuery('and or not')).toBeUndefined();
  });
});
