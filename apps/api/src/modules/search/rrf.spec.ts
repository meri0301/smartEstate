import { describe, expect, it } from 'vitest';
import { fuse, RRF_K } from './rrf.js';

const lexical = (...ids: string[]) => ({ name: 'lexical', listingIds: ids });
const semantic = (...ids: string[]) => ({ name: 'semantic', listingIds: ids });

describe('fuse', () => {
  it('puts a listing both arms rank highly above one only one arm found', () => {
    const fused = fuse([lexical('a', 'b'), semantic('b', 'a')]);

    expect(fused.map((entry) => entry.listingId)).toEqual(['a', 'b']);
  });

  it('keeps a listing only one arm found, rather than requiring agreement', () => {
    // An intersection would throw away exactly the results running two arms is
    // for: the ones lexical matching misses because the word is not in the text.
    const fused = fuse([lexical('a'), semantic('z')]);

    expect(fused.map((entry) => entry.listingId).sort()).toEqual(['a', 'z']);
  });

  it('scores by reciprocal rank, not by position in the output', () => {
    const [first] = fuse([lexical('a'), semantic('a')]);

    expect(first?.score).toBeCloseTo(2 / (RRF_K + 1), 10);
  });

  it('reports where each arm placed a listing, so a result can be accounted for', () => {
    const fused = fuse([lexical('x', 'y'), semantic('y')]);
    const y = fused.find((entry) => entry.listingId === 'y');

    expect(y?.ranks).toEqual({ lexical: 2, semantic: 1 });
  });

  it('records only the arms that actually found a listing', () => {
    const fused = fuse([lexical('x'), semantic('y')]);

    expect(fused.find((entry) => entry.listingId === 'x')?.ranks).toEqual({ lexical: 1 });
  });

  it('lets two second places beat one first place', () => {
    // 2/(k+2) > 1/(k+1): agreement is worth more than a single arm's conviction,
    // which is the property the whole fusion exists to get.
    const fused = fuse([lexical('solo', 'both'), semantic('other', 'both')]);

    expect(fused[0]?.listingId).toBe('both');
  });

  it('does not let one arm count a listing twice', () => {
    const fused = fuse([lexical('a', 'a'), semantic('b')]);

    expect(fused.find((entry) => entry.listingId === 'a')?.score).toBeCloseTo(1 / (RRF_K + 1), 10);
  });

  it('is stable: the same input gives the same order every time', () => {
    const arms = [lexical('a', 'b', 'c'), semantic('c', 'b', 'a')];

    expect(fuse(arms).map((entry) => entry.listingId)).toEqual(
      fuse(arms).map((entry) => entry.listingId),
    );
  });

  it('breaks a tied score by the better single rank', () => {
    // Both score 1/(k+1) + 1/(k+3); "near" was first somewhere and "far" was not.
    const fused = fuse([lexical('near', 'x', 'far'), semantic('far', 'y', 'near')]);

    expect(
      fused
        .map((entry) => entry.listingId)
        .slice(0, 2)
        .sort(),
    ).toEqual(['far', 'near']);
  });

  it('returns nothing when neither arm found anything', () => {
    expect(fuse([lexical(), semantic()])).toEqual([]);
  });

  it('works with one arm, which is what a search with no vectors is', () => {
    const fused = fuse([lexical('a', 'b')]);

    expect(fused.map((entry) => entry.listingId)).toEqual(['a', 'b']);
  });

  it('flattens the ranking as k grows', () => {
    // Mirrored arms would give both listings the same pair of ranks and so the
    // same score; the spread only exists when the arms disagree about how many
    // results they have.
    const arms = [lexical('a', 'b'), semantic('a')];
    const spread = (k: number) => {
      const fused = fuse(arms, k);
      return (fused[0]?.score ?? 0) - (fused[1]?.score ?? 0);
    };

    expect(spread(10)).toBeGreaterThan(spread(1000));
  });
});
