import type { AlternativeListing, ListingSummary } from '@smartestate/contracts';
import { describe, expect, it } from 'vitest';
import { buildComparison, markBest, MAX_COMPARED } from './comparison.js';

const listing = (id: string, title = `Listing ${id}`): ListingSummary => ({
  id,
  publicId: `L-${id}`,
  status: 'PUBLISHED',
  locale: 'en',
  title,
  priceAmd: 45_000_000,
  pricePerSqmAmd: 625_000,
  originalCurrency: 'AMD',
  originalPrice: null,
  priceNegotiable: false,
  rooms: 2,
  totalArea: 72,
  floor: 4,
  totalFloors: 9,
  buildingType: 'STONE',
  condition: 'GOOD',
  district: { slug: 'kentron', name: { hy: 'Կենտրոն', ru: 'Кентрон', en: 'Kentron' } },
  location: { lat: 40.18, lon: 44.51 },
  thumbnailUrl: null,
  publishedAt: '2026-09-01T00:00:00.000Z',
});

const alternative = (
  id: string,
  comparisons: AlternativeListing['comparisons'],
): AlternativeListing => ({
  listing: listing(id),
  relation: 'TRADE_OFF',
  comparisons,
  betterCount: comparisons.filter((entry) => entry.direction === 'better').length,
  worseCount: comparisons.filter((entry) => entry.direction === 'worse').length,
});

const price = (subject: number, value: number): AlternativeListing['comparisons'][number] => ({
  criterion: 'price',
  direction: value < subject ? 'better' : value > subject ? 'worse' : 'same',
  subject,
  alternative: value,
  unit: 'amd',
});

const area = (subject: number, value: number): AlternativeListing['comparisons'][number] => ({
  criterion: 'area',
  direction: value > subject ? 'better' : value < subject ? 'worse' : 'same',
  subject,
  alternative: value,
  unit: 'sqm',
});

describe('markBest', () => {
  it('marks the largest value where more is better', () => {
    const cells = markBest('area', [
      { value: 60, unit: 'sqm', isBest: false },
      { value: 80, unit: 'sqm', isBest: false },
    ]);

    expect(cells.map((cell) => cell.isBest)).toEqual([false, true]);
  });

  it('marks the smallest value where less is better', () => {
    for (const criterion of ['price', 'location', 'value'] as const) {
      const cells = markBest(criterion, [
        { value: 10, unit: 'amd', isBest: false },
        { value: 4, unit: 'amd', isBest: false },
      ]);

      expect(cells.map((cell) => cell.isBest)).toEqual([false, true]);
    }
  });

  it('marks every cell that ties, rather than picking one', () => {
    // Breaking a tie would read as a difference where there is none.
    const cells = markBest('area', [
      { value: 72, unit: 'sqm', isBest: false },
      { value: 72, unit: 'sqm', isBest: false },
      { value: 60, unit: 'sqm', isBest: false },
    ]);

    expect(cells.map((cell) => cell.isBest)).toEqual([true, true, false]);
  });
});

describe('buildComparison', () => {
  const subject = listing('subject', 'The one being viewed');

  it('puts the subject in the first column', () => {
    const table = buildComparison(subject, ['price'], [alternative('a', [price(45, 40)])]);

    expect(table.listings[0]?.id).toBe('subject');
    expect(table.listings[1]?.id).toBe('a');
  });

  it('reads the subject’s value from the comparison, so the table needs no second source', () => {
    const table = buildComparison(subject, ['price'], [alternative('a', [price(45, 40)])]);

    expect(table.rows[0]?.cells[0]?.value).toBe(45);
    expect(table.rows[0]?.cells[1]?.value).toBe(40);
  });

  it('marks the winner of each row', () => {
    const table = buildComparison(
      subject,
      ['price', 'area'],
      [alternative('a', [price(45, 40), area(72, 60)])],
    );

    const byCriterion = Object.fromEntries(table.rows.map((row) => [row.criterion, row.cells]));
    // Cheaper wins the price row; the subject keeps the area row.
    expect(byCriterion.price?.map((cell) => cell.isBest)).toEqual([false, true]);
    expect(byCriterion.area?.map((cell) => cell.isBest)).toEqual([true, false]);
  });

  it('compares several alternatives in one table', () => {
    const table = buildComparison(
      subject,
      ['price'],
      [alternative('a', [price(45, 40)]), alternative('b', [price(45, 38)])],
    );

    expect(table.listings).toHaveLength(3);
    expect(table.rows[0]?.cells.map((cell) => cell.value)).toEqual([45, 40, 38]);
    expect(table.rows[0]?.cells.map((cell) => cell.isBest)).toEqual([false, false, true]);
  });

  it('stops at four columns, because a wider table stops being readable', () => {
    const many = ['a', 'b', 'c', 'd', 'e'].map((id) => alternative(id, [price(45, 40)]));

    const table = buildComparison(subject, ['price'], many);

    expect(table.listings).toHaveLength(MAX_COMPARED);
  });

  it('drops a criterion one of the columns has no value for', () => {
    // A row with a hole in it cannot be won, and showing it would invite the
    // reader to compare a number with an absence.
    const table = buildComparison(
      subject,
      ['price', 'area'],
      [alternative('a', [price(45, 40), area(72, 60)]), alternative('b', [price(45, 38)])],
    );

    expect(table.rows.map((row) => row.criterion)).toEqual(['price']);
  });

  it('keeps the criteria in the order the server gave them', () => {
    const table = buildComparison(
      subject,
      ['area', 'price'],
      [alternative('a', [price(45, 40), area(72, 80)])],
    );

    expect(table.rows.map((row) => row.criterion)).toEqual(['area', 'price']);
  });

  it('has nothing to show for a listing with no alternatives', () => {
    const table = buildComparison(subject, ['price'], []);

    expect(table.rows).toEqual([]);
    expect(table.listings).toEqual([subject]);
  });
});
