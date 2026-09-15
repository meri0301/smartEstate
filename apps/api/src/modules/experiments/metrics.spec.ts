import { describe, expect, it } from 'vitest';
import {
  estimate,
  gradeListing,
  hadFeedback,
  ndcgAtK,
  precisionAtK,
  welchDifference,
  type JudgedSession,
} from './metrics.js';

const session = (shown: string[], relevance: Record<string, number>): JudgedSession => ({
  shown,
  relevance: new Map(Object.entries(relevance)),
});

describe('gradeListing', () => {
  it('takes the strongest signal', () => {
    expect(gradeListing(['VIEW', 'FAVORITE'])).toBe(3);
    expect(gradeListing(['VIEW', 'COMPARE'])).toBe(2);
    expect(gradeListing(['VIEW'])).toBe(1);
  });

  it('reads a dismissal after a click as rejection', () => {
    // Somebody who looked and then dismissed has told you something, and it is
    // not that the listing was relevant.
    expect(gradeListing(['VIEW', 'DISMISS'])).toBe(0);
    expect(gradeListing(['FAVORITE', 'UNFAVORITE'])).toBe(0);
  });

  it('is zero for nothing at all', () => {
    expect(gradeListing([])).toBe(0);
  });
});

describe('precisionAtK', () => {
  it('is the share of the top k that were acted on', () => {
    const judged = session(['a', 'b', 'c', 'd'], { a: 1, c: 3 });

    expect(precisionAtK(judged, 4)).toBe(0.5);
  });

  it('looks only at the top k', () => {
    const judged = session(['a', 'b', 'c', 'd'], { d: 3 });

    expect(precisionAtK(judged, 2)).toBe(0);
    expect(precisionAtK(judged, 4)).toBe(0.25);
  });

  it('does not count a rejected listing as a hit', () => {
    expect(precisionAtK(session(['a', 'b'], { a: 0, b: 1 }), 2)).toBe(0.5);
  });

  it('is zero for an empty ranking', () => {
    expect(precisionAtK(session([], {}), 10)).toBe(0);
  });
});

describe('ndcgAtK', () => {
  it('is one when the wanted things came first', () => {
    expect(ndcgAtK(session(['a', 'b', 'c'], { a: 3, b: 1 }), 3)).toBe(1);
  });

  it('is less than one when the order was wrong', () => {
    const wrongWayRound = ndcgAtK(session(['a', 'b', 'c'], { a: 1, b: 3 }), 3);

    expect(wrongWayRound).toBeLessThan(1);
    expect(wrongWayRound).toBeGreaterThan(0);
  });

  it('matches the textbook value on a worked example', () => {
    // Gains 3,2,3,0,1,2 → DCG 3 + 2/log2(3) + 3/2 + 0 + 1/log2(6) + 2/log2(7);
    // ideal 3,3,2,2,1,0. This is the example every NDCG explainer uses.
    const judged = session(['a', 'b', 'c', 'd', 'e', 'f'], {
      a: 3,
      b: 2,
      c: 3,
      d: 0,
      e: 1,
      f: 2,
    });
    const dcg = 3 + 2 / Math.log2(3) + 3 / 2 + 1 / Math.log2(6) + 2 / Math.log2(7);
    const ideal = 3 + 3 / Math.log2(3) + 2 / 2 + 2 / Math.log2(5) + 1 / Math.log2(6);

    expect(ndcgAtK(judged, 6)).toBeCloseTo(dcg / ideal, 10);
  });

  it('is zero when nothing shown was wanted', () => {
    expect(ndcgAtK(session(['a', 'b'], {}), 2)).toBe(0);
  });

  it('rewards putting the favourite above the click', () => {
    const better = ndcgAtK(session(['a', 'b'], { a: 3, b: 1 }), 2);
    const worse = ndcgAtK(session(['a', 'b'], { a: 1, b: 3 }), 2);

    expect(better).toBeGreaterThan(worse);
  });
});

describe('hadFeedback', () => {
  it('is true when anything shown was judged, even as a rejection', () => {
    expect(hadFeedback(session(['a'], { a: 0 }))).toBe(true);
    expect(hadFeedback(session(['a'], {}))).toBe(false);
  });

  it('ignores judgements on listings that were not shown', () => {
    expect(hadFeedback(session(['a'], { z: 3 }))).toBe(false);
  });
});

describe('estimate', () => {
  it('reports the mean, the standard error and n', () => {
    const result = estimate([1, 0, 1, 0]);

    expect(result.mean).toBe(0.5);
    expect(result.n).toBe(4);
    // Sample variance 1/3, so SE = sqrt((1/3)/4).
    expect(result.standardError).toBeCloseTo(Math.sqrt(1 / 12), 10);
  });

  it('has no standard error to report for one value, and none at all for none', () => {
    expect(estimate([0.7])).toEqual({ mean: 0.7, standardError: 0, n: 1 });
    expect(estimate([])).toEqual({ mean: 0, n: 0 });
  });
});

describe('welchDifference', () => {
  it('is centred on the difference of means', () => {
    const result = welchDifference(
      { mean: 0.6, standardError: 0.05, n: 40 },
      { mean: 0.4, standardError: 0.05, n: 40 },
    );

    expect(result.difference).toBeCloseTo(0.2, 10);
    expect(result.confidenceLow).toBeLessThan(0.2);
    expect(result.confidenceHigh).toBeGreaterThan(0.2);
  });

  it('excludes zero only when the arms are far enough apart for their noise', () => {
    const clear = welchDifference(
      { mean: 0.6, standardError: 0.02, n: 100 },
      { mean: 0.4, standardError: 0.02, n: 100 },
    );
    const murky = welchDifference(
      { mean: 0.6, standardError: 0.2, n: 5 },
      { mean: 0.4, standardError: 0.2, n: 5 },
    );

    expect(clear.confidenceLow).toBeGreaterThan(0);
    expect(murky.confidenceLow).toBeLessThan(0);
  });
});
