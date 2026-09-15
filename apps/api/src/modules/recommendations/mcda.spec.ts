import { RANKING_CRITERIA } from '@smartestate/contracts';
import { describe, expect, it } from 'vitest';
import {
  normaliseWeights,
  rank,
  topsis,
  usableCriteria,
  weightedSum,
  type CriterionScores,
} from './mcda.js';

const candidate = (name: string, scores: CriterionScores) => ({ candidate: name, scores });

/** Reads two weights that the test has already asserted are present. */
const ratio = (weights: Record<string, number>, a: string, b: string): number =>
  (weights[a] ?? 0) / (weights[b] ?? 1);

describe('normaliseWeights', () => {
  it('turns relative priorities into shares that sum to one', () => {
    const weights = normaliseWeights({ price: 2, size: 1, rooms: 1 }, ['price', 'size', 'rooms']);

    expect(weights.price).toBeCloseTo(0.5, 10);
    expect(Object.values(weights).reduce((sum, value) => sum + value, 0)).toBeCloseTo(1, 10);
  });

  it('ranks a profile of all fives exactly like one of all ones', () => {
    const fives = normaliseWeights({ price: 5, size: 5 }, ['price', 'size']);
    const ones = normaliseWeights({ price: 1, size: 1 }, ['price', 'size']);

    expect(fives).toEqual(ones);
  });

  it('redistributes the weight of a criterion that cannot be scored', () => {
    const complete = normaliseWeights({ price: 1, value: 1, size: 1 }, ['price', 'value', 'size']);
    const reduced = normaliseWeights({ price: 1, value: 1, size: 1 }, ['price', 'size']);

    expect(complete.price).toBeCloseTo(1 / 3, 10);
    expect(reduced.price).toBeCloseTo(0.5, 10);
    expect(reduced.value).toBeUndefined();
    // The survivors keep their importance relative to one another.
    expect(ratio(reduced, 'price', 'size')).toBeCloseTo(ratio(complete, 'price', 'size'), 10);
  });

  it('drops a criterion the buyer gave no weight at all', () => {
    const weights = normaliseWeights({ price: 1, size: 0 }, ['price', 'size']);

    expect(weights.size).toBeUndefined();
    expect(weights.price).toBe(1);
  });

  it('treats everything as equal when nothing was weighted, rather than scoring every listing zero', () => {
    const weights = normaliseWeights({ price: 0, size: 0 }, ['price', 'size']);

    expect(weights.price).toBe(0.5);
    expect(weights.size).toBe(0.5);
  });
});

describe('usableCriteria', () => {
  it('keeps a criterion every candidate could be scored on', () => {
    const rows = [
      { price: 0.5, value: 0.2 },
      { price: 0.1, value: 0.9 },
    ];

    expect(usableCriteria(rows, ['price', 'value'])).toEqual(['price', 'value']);
  });

  it('drops one that is missing for any candidate, because scores must be comparable', () => {
    const rows: CriterionScores[] = [
      { price: 0.5, value: 0.2 },
      { price: 0.1, value: undefined },
    ];

    expect(usableCriteria(rows, ['price', 'value'])).toEqual(['price']);
  });

  it('drops one that is present but not a finite number', () => {
    const rows: CriterionScores[] = [{ price: Number.NaN }, { price: 0.5 }];

    expect(usableCriteria(rows, ['price'])).toEqual([]);
  });

  it('accepts every criterion when nothing is missing', () => {
    const complete = Object.fromEntries(RANKING_CRITERIA.map((name) => [name, 0.5]));

    expect(usableCriteria([complete], RANKING_CRITERIA)).toEqual([...RANKING_CRITERIA]);
  });
});

describe('weightedSum', () => {
  const weights = { price: 0.6, size: 0.4 };

  it('is the weighted mean, and the breakdown adds up to it', () => {
    const [result] = weightedSum([candidate('a', { price: 1, size: 0.5 })], weights);

    expect(result?.score).toBeCloseTo(0.8, 10);
    expect(result?.breakdown.reduce((sum, entry) => sum + entry.contribution, 0)).toBeCloseTo(
      result?.score ?? 0,
      10,
    );
  });

  it('orders the breakdown so the first entry is the strongest reason', () => {
    const [result] = weightedSum([candidate('a', { price: 0.2, size: 1 })], weights);

    expect(result?.breakdown[0]?.criterion).toBe('size');
  });

  it('treats a criterion absent from the scores as zero, not as missing weight', () => {
    const [result] = weightedSum([candidate('a', { price: 1 })], weights);

    expect(result?.score).toBeCloseTo(0.6, 10);
  });
});

describe('topsis', () => {
  const weights = { price: 0.5, size: 0.5 };

  it('puts the all-round option above a lopsided one, where a weighted sum would tie them', () => {
    const candidates = [
      candidate('balanced', { price: 0.6, size: 0.6 }),
      candidate('lopsided', { price: 1, size: 0.2 }),
    ];

    const sums = weightedSum(candidates, weights);
    expect(sums[0]?.score).toBeCloseTo(sums[1]?.score ?? 0, 10);

    const distances = topsis(candidates, weights);
    expect(distances[0]?.score).toBeGreaterThan(distances[1]?.score ?? 0);
  });

  it('scores the best available candidate one and the worst zero', () => {
    const results = topsis(
      [candidate('best', { price: 1, size: 1 }), candidate('worst', { price: 0, size: 0 })],
      weights,
    );

    expect(results[0]?.score).toBeCloseTo(1, 10);
    expect(results[1]?.score).toBeCloseTo(0, 10);
  });

  it('calls identical candidates equally good instead of dividing by zero', () => {
    const results = topsis(
      [candidate('a', { price: 0.5, size: 0.5 }), candidate('b', { price: 0.5, size: 0.5 })],
      weights,
    );

    expect(results.map((result) => result.score)).toEqual([1, 1]);
  });

  it('has nothing to rank when there are no candidates', () => {
    expect(topsis([], weights)).toEqual([]);
  });
});

describe('rank', () => {
  const weights = { price: 0.5, size: 0.5 };
  const candidates = [
    candidate('poor', { price: 0.1, size: 0.1 }),
    candidate('good', { price: 0.9, size: 0.8 }),
    candidate('middling', { price: 0.5, size: 0.5 }),
  ];

  it.each(['WEIGHTED_SUM', 'TOPSIS'] as const)('returns %s results best first', (method) => {
    const results = rank(method, candidates, weights);

    expect(results.map((result) => result.candidate)).toEqual(['good', 'middling', 'poor']);
    const scores = results.map((result) => result.score);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
  });

  it('leaves the input untouched, so a caller can rank the same set twice', () => {
    const before = candidates.map((entry) => entry.candidate);
    rank('TOPSIS', candidates, weights);

    expect(candidates.map((entry) => entry.candidate)).toEqual(before);
  });
});
