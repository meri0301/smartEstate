import { describe, expect, it } from 'vitest';
import type { ListingRow } from '../listings/listing-row.js';
import {
  compare,
  compareOne,
  comparableCriteria,
  floorScore,
  PRICE_INDIFFERENCE_RATIO,
  relationOf,
  toComparable,
  type ComparableVector,
} from './dominance.js';

const row = (overrides: Partial<ListingRow> = {}): ListingRow =>
  ({
    id: 'listing-1',
    price_amd: 45_000_000,
    total_area: 72,
    rooms: 3,
    floor: 4,
    condition: 'GOOD',
    lat: 40.177,
    lon: 44.503,
    b_building_type: 'STONE',
    b_construction_year: 2000,
    b_total_floors: 9,
    b_has_elevator: true,
    b_seismic_retrofit: false,
    ...overrides,
  }) as ListingRow;

describe('floorScore', () => {
  it('marks the ground floor down, which everybody agrees about', () => {
    expect(floorScore(1, 9, true)).toBe(0);
  });

  it('marks the top floor down only when there is no lift', () => {
    expect(floorScore(9, 9, false)).toBe(0.5);
    expect(floorScore(9, 9, true)).toBe(1);
  });

  it('treats every other floor as the same', () => {
    // Preferring the fourth to the fifth is taste, and taste has no place in a
    // dominance claim.
    expect(floorScore(4, 9, true)).toBe(floorScore(5, 9, true));
  });
});

describe('compareOne', () => {
  it('calls a cheaper price better', () => {
    expect(compareOne('price', 45_000_000, 40_000_000)).toBe('better');
  });

  it('calls a larger area better', () => {
    expect(compareOne('area', 72, 80)).toBe('better');
  });

  it('calls a shorter distance better', () => {
    expect(compareOne('location', 3_000, 900)).toBe('better');
  });

  it('calls a price further below the estimate better', () => {
    // `value` is the asking price against what the model thinks it is worth, so
    // a more negative number is the bargain.
    expect(compareOne('value', 5, -8)).toBe('better');
  });

  it('ignores a price difference too small to be a reason', () => {
    const subject = 45_000_000;
    const withinThreshold = subject * (1 - PRICE_INDIFFERENCE_RATIO * 0.9);

    expect(compareOne('price', subject, withinThreshold)).toBe('same');
  });

  it('scales the price threshold with the price', () => {
    // Half a million is nothing on a 200M flat and a real saving on a 20M one.
    expect(compareOne('price', 200_000_000, 199_500_000)).toBe('same');
    expect(compareOne('price', 20_000_000, 19_500_000)).toBe('better');
  });

  it('ignores a difference of a square metre', () => {
    expect(compareOne('area', 72, 73)).toBe('same');
    expect(compareOne('area', 72, 76)).toBe('better');
  });

  it('ignores a couple of minutes’ walk', () => {
    expect(compareOne('location', 1_000, 1_150)).toBe('same');
    expect(compareOne('location', 1_000, 600)).toBe('better');
  });
});

describe('comparableCriteria', () => {
  it('compares only what both listings have a value for', () => {
    const subject: ComparableVector = { price: 1, area: 1, location: 100 };
    const alternative: ComparableVector = { price: 1, area: 1 };

    expect(comparableCriteria(subject, alternative)).toEqual(['price', 'area']);
  });

  it('returns them in a stable order whichever way round they are given', () => {
    const a: ComparableVector = { area: 1, price: 1 };
    const b: ComparableVector = { price: 2, area: 2 };

    expect(comparableCriteria(a, b)).toEqual(comparableCriteria(b, a));
  });
});

describe('relationOf', () => {
  it('is dominance when something is better and nothing is worse', () => {
    expect(relationOf(2, 0)).toBe('DOMINATES');
  });

  it('is equivalence when nothing is better and nothing is worse', () => {
    expect(relationOf(0, 0)).toBe('EQUIVALENT');
  });

  it('is a trade-off as soon as anything is worse', () => {
    expect(relationOf(3, 1)).toBe('TRADE_OFF');
    expect(relationOf(0, 1)).toBe('TRADE_OFF');
  });
});

describe('compare', () => {
  const subject = toComparable(row());

  it('finds dominance when an alternative gives up nothing', () => {
    const better = toComparable(row({ price_amd: 39_000_000, total_area: 80 }));

    const result = compare(subject, better);

    expect(result.relation).toBe('DOMINATES');
    expect(result.betterCount).toBe(2);
    expect(result.worseCount).toBe(0);
  });

  it('finds a trade-off when something is given up', () => {
    const cheaperButSmaller = toComparable(row({ price_amd: 36_000_000, total_area: 58 }));

    const result = compare(subject, cheaperButSmaller);

    expect(result.relation).toBe('TRADE_OFF');
    expect(result.betterCount).toBe(1);
    expect(result.worseCount).toBe(1);
  });

  it('finds equivalence between two listings nobody could choose between', () => {
    const almostIdentical = toComparable(row({ price_amd: 45_400_000, total_area: 73 }));

    expect(compare(subject, almostIdentical).relation).toBe('EQUIVALENT');
  });

  it('puts the gains first, then the losses, then the ties', () => {
    const mixed = toComparable(
      row({ price_amd: 36_000_000, total_area: 58, condition: 'DESIGNER' }),
    );

    // What do I get, what does it cost me, and what stays the same — which is
    // the order somebody reads a comparison in, and not alphabetical order.
    const rank = { better: 0, worse: 1, same: 2 };
    const directions = compare(subject, mixed).comparisons.map((entry) => entry.direction);
    const ranks = directions.map((direction) => rank[direction]);

    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    expect(directions[0]).toBe('better');
    expect(directions).toContain('worse');
    expect(directions.at(-1)).toBe('same');
  });

  it('reports both values, so the claim can be checked', () => {
    const cheaper = toComparable(row({ price_amd: 39_000_000 }));

    const price = compare(subject, cheaper).comparisons.find(
      (entry) => entry.criterion === 'price',
    );
    expect(price).toMatchObject({
      subject: 45_000_000,
      alternative: 39_000_000,
      direction: 'better',
      unit: 'amd',
    });
  });

  it('describes a listing that is worse on everything, and leaves excluding it to the caller', () => {
    const worse = toComparable(row({ price_amd: 52_000_000, total_area: 60 }));

    const result = compare(subject, worse);

    expect(result.relation).toBe('TRADE_OFF');
    expect(result.betterCount).toBe(0);
    expect(result.worseCount).toBe(2);
  });

  it('leaves location out entirely when the buyer named no place', () => {
    const other = toComparable(row({ lat: 40.3, lon: 44.6 }));

    const criteria = compare(subject, other).comparisons.map((entry) => entry.criterion);
    expect(criteria).not.toContain('location');
  });

  it('compares location when there is an anchor, and calls closer better', () => {
    const anchor = { lat: 40.177, lon: 44.503 };
    const here = toComparable(row(), { anchor });
    const faraway = toComparable(row({ lat: 40.25, lon: 44.6 }), { anchor });

    const result = compare(faraway, here);
    const location = result.comparisons.find((entry) => entry.criterion === 'location');

    expect(location?.direction).toBe('better');
    expect(location?.unit).toBe('metres');
  });

  it('leaves value out when the model service could not price the pair', () => {
    const deviations = new Map([['listing-1', -8]]);
    const priced = toComparable(row(), { deviations });
    const unpriced = toComparable(row({ id: 'listing-2' }), { deviations });

    expect(compare(priced, unpriced).comparisons.map((entry) => entry.criterion)).not.toContain(
      'value',
    );
  });

  it('dominance over fewer criteria is still reported as dominance, with fewer comparisons', () => {
    // The caller is told which criteria were dropped; this function only reports
    // what it was able to compare.
    const withAnchor = { lat: 40.177, lon: 44.503 };
    const few = compare(toComparable(row()), toComparable(row({ price_amd: 39_000_000 })));
    const many = compare(
      toComparable(row(), { anchor: withAnchor }),
      toComparable(row({ price_amd: 39_000_000 }), { anchor: withAnchor }),
    );

    expect(few.relation).toBe('DOMINATES');
    expect(many.relation).toBe('DOMINATES');
    expect(many.comparisons.length).toBe(few.comparisons.length + 1);
  });
});
