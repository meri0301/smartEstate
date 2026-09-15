import type { CriterionScore, PreferenceProfile, RankingCriterion } from '@smartestate/contracts';
import { describe, expect, it } from 'vitest';
import type { ListingRow } from '../listings/listing-row.js';
import { explain } from './explanation.js';

const preferences = (overrides: Partial<PreferenceProfile> = {}): PreferenceProfile => ({
  budgetAmd: 50_000_000,
  roomsMin: 2,
  districts: [],
  weights: {
    price: 1,
    value: 1,
    size: 0.6,
    rooms: 0.8,
    location: 0.8,
    condition: 0.6,
    building: 0.4,
  },
  ...overrides,
});

/** Only the fields the explainer reads; the rest of a row is irrelevant to it. */
const row = (overrides: Partial<ListingRow> = {}): ListingRow =>
  ({
    id: 'listing-1',
    price_amd: 40_000_000,
    total_area: 72,
    rooms: 3,
    lat: 40.177,
    lon: 44.503,
    b_construction_year: 1975,
    ...overrides,
  }) as ListingRow;

/** An even split over seven criteria, which is what an unopinionated buyer gets. */
const EVEN_WEIGHT = 1 / 7;

const score = (
  criterion: RankingCriterion,
  value: number,
  weight = EVEN_WEIGHT,
): CriterionScore => ({
  criterion,
  score: value,
  weight,
  contribution: value * weight,
});

describe('explain', () => {
  it('names a criterion that scored well as a strength', () => {
    const result = explain({
      row: row(),
      breakdown: [score('price', 0.9)],
      preferences: preferences(),
    });

    expect(result.highlights).toEqual([
      {
        criterion: 'price',
        kind: 'strength',
        score: 0.9,
        fact: { key: 'budgetHeadroomPct', value: 20 },
      },
    ]);
  });

  it('names a criterion that scored badly as a trade-off', () => {
    const result = explain({
      row: row(),
      breakdown: [score('condition', 0.3)],
      preferences: preferences(),
    });

    expect(result.highlights[0]).toMatchObject({ criterion: 'condition', kind: 'tradeoff' });
  });

  it('says nothing about a criterion in the ordinary middle', () => {
    const result = explain({
      row: row(),
      breakdown: [score('size', 0.5), score('rooms', 0.6)],
      preferences: preferences(),
    });

    expect(result.highlights).toEqual([]);
  });

  it('puts the strengths before the trade-offs', () => {
    // A reader wants to know what is good about a listing before what is wrong
    // with it; a trade-off read first is read as a rejection.
    const result = explain({
      row: row(),
      breakdown: [score('condition', 0.1), score('price', 0.8), score('building', 0.2)],
      preferences: preferences(),
    });

    expect(result.highlights.map((highlight) => highlight.kind)).toEqual([
      'strength',
      'tradeoff',
      'tradeoff',
    ]);
  });

  it('orders reasons by how much the criterion actually moved the score', () => {
    const result = explain({
      row: row(),
      breakdown: [score('size', 0.8, 0.1), score('price', 0.8, 0.5)],
      preferences: preferences(),
    });

    expect(result.highlights.map((highlight) => highlight.criterion)).toEqual(['price', 'size']);
  });

  it('leaves out a criterion the buyer gave almost no weight to', () => {
    // It scored perfectly and still explains nothing: with no weight behind it,
    // it is not why the listing is where it is.
    const result = explain({
      row: row(),
      breakdown: [score('building', 1, 0.01)],
      preferences: preferences(),
    });

    expect(result.highlights).toEqual([]);
  });

  it('gives at most four reasons, because a longer list is not an explanation', () => {
    const result = explain({
      row: row(),
      breakdown: [
        score('price', 0.95),
        score('value', 0.9),
        score('size', 0.85),
        score('rooms', 0.8),
        score('location', 0.75),
      ],
      preferences: preferences(),
    });

    expect(result.highlights).toHaveLength(4);
  });

  it('carries the figure behind each reason, as a number', () => {
    const result = explain({
      row: row({ total_area: 96.4 }),
      breakdown: [score('size', 0.9), score('rooms', 1), score('building', 0.2)],
      preferences: preferences(),
      deviationPct: -12.34,
    });

    const facts = Object.fromEntries(
      result.highlights.map((highlight) => [highlight.criterion, highlight.fact]),
    );
    expect(facts.size).toEqual({ key: 'areaSqm', value: 96.4 });
    expect(facts.rooms).toEqual({ key: 'rooms', value: 3 });
    expect(facts.building).toEqual({ key: 'buildingAgeYears', value: 51 });
  });

  it('reports the deviation from the estimate when there was one', () => {
    const result = explain({
      row: row(),
      breakdown: [score('value', 0.8)],
      preferences: preferences(),
      deviationPct: -12.34,
    });

    expect(result.highlights[0]?.fact).toEqual({ key: 'priceVsEstimatePct', value: -12.3 });
  });

  it('omits the value figure when the model service could not supply one', () => {
    const result = explain({
      row: row(),
      breakdown: [score('value', 0.8)],
      preferences: preferences(),
    });

    expect(result.highlights[0]?.fact).toBeUndefined();
  });

  it('measures the distance only when the buyer named a place', () => {
    const withoutAnchor = explain({
      row: row(),
      breakdown: [score('location', 0.9)],
      preferences: preferences(),
    });
    const withAnchor = explain({
      row: row(),
      breakdown: [score('location', 0.9)],
      preferences: preferences({ anchor: { lat: 40.1772, lon: 44.5035 } }),
    });

    expect(withoutAnchor.highlights[0]?.fact).toBeUndefined();
    expect(withAnchor.highlights[0]?.fact?.key).toBe('distanceM');
    expect(withAnchor.highlights[0]?.fact?.value).toBeLessThan(100);
  });

  it('gives condition no figure, because its value is a name and not a number', () => {
    const result = explain({
      row: row(),
      breakdown: [score('condition', 0.9)],
      preferences: preferences(),
    });

    expect(result.highlights[0]).toEqual({ criterion: 'condition', kind: 'strength', score: 0.9 });
  });

  it('reports a price over budget as negative headroom rather than hiding it', () => {
    const result = explain({
      row: row({ price_amd: 55_000_000 }),
      breakdown: [score('price', 0.05)],
      preferences: preferences(),
    });

    expect(result.highlights[0]?.fact).toEqual({ key: 'budgetHeadroomPct', value: -10 });
  });

  it('never writes a paragraph of its own', () => {
    // The prose is a model's job, and its absence is the normal case.
    const result = explain({
      row: row(),
      breakdown: [score('price', 0.9)],
      preferences: preferences(),
    });

    expect(result.text).toBeUndefined();
  });
});
