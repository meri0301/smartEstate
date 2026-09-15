import { describe, expect, it } from 'vitest';
import { applyParsedFilters, toChips, type ChipLabels } from './chips.js';
import { EMPTY_FILTERS, type ListingFilterValues } from './filters.js';

/** Echoes the key and its parameters, so a test can assert on both. */
const labels: ChipLabels = {
  t: (key, params) =>
    params === undefined || Object.keys(params).length === 0
      ? key
      : `${key}(${Object.entries(params)
          .map(([name, value]) => `${name}=${String(value)}`)
          .join(',')})`,
  price: (amount) => `֏${String(amount / 1_000_000)}M`,
  area: (value) => `${String(value)} m²`,
  district: (slug) => `District:${slug}`,
};

const chipsFor = (values: Partial<ListingFilterValues>) =>
  toChips({ ...EMPTY_FILTERS, ...values }, labels);

describe('toChips', () => {
  it('shows nothing when nothing is filtering', () => {
    expect(chipsFor({})).toEqual([]);
  });

  it('describes a price range as two removable chips', () => {
    const chips = chipsFor({ priceMin: 30_000_000, priceMax: 60_000_000 });

    expect(chips.map((chip) => chip.label)).toEqual([
      'chips.priceFrom(price=֏30M)',
      'chips.priceTo(price=֏60M)',
    ]);
    expect(chips[0]?.remove().priceMin).toBeUndefined();
    expect(chips[0]?.remove().priceMax).toBe(60_000_000);
  });

  it('shows an exact room count as one chip, and removes both bounds with it', () => {
    const chips = chipsFor({ roomsMin: 2, roomsMax: 2 });

    expect(chips).toHaveLength(1);
    expect(chips[0]?.label).toBe('roomCount(count=2)');
    const removed = chips[0]?.remove();
    expect(removed?.roomsMin).toBeUndefined();
    expect(removed?.roomsMax).toBeUndefined();
  });

  it('shows an open room range as two chips', () => {
    const chips = chipsFor({ roomsMin: 2, roomsMax: 4 });

    expect(chips.map((chip) => chip.id)).toEqual(['roomsMin', 'roomsMax']);
  });

  it('names each district in the reader’s language and removes only that one', () => {
    const chips = chipsFor({ districts: ['kentron', 'arabkir'] });

    expect(chips.map((chip) => chip.label)).toEqual(['District:kentron', 'District:arabkir']);
    expect(chips[0]?.remove().districts).toEqual(['arabkir']);
  });

  it('shows the flags that are set and none of the others', () => {
    const chips = chipsFor({ hasElevator: true, excludeGroundFloor: true });

    expect(chips.map((chip) => chip.id)).toEqual(['hasElevator', 'excludeGroundFloor']);
    expect(chips[0]?.remove().hasElevator).toBe(false);
  });

  it('gives every chip an id of its own, so a list can be keyed by it', () => {
    const chips = chipsFor({
      priceMax: 60_000_000,
      districts: ['kentron', 'arabkir'],
      buildingTypes: ['STONE', 'PANEL'],
      conditions: ['GOOD'],
      hasParking: true,
    });

    expect(new Set(chips.map((chip) => chip.id)).size).toBe(chips.length);
  });

  it('never mutates the filters it was given', () => {
    const values: ListingFilterValues = { ...EMPTY_FILTERS, districts: ['kentron', 'arabkir'] };
    const chips = toChips(values, labels);

    chips[0]?.remove();

    expect(values.districts).toEqual(['kentron', 'arabkir']);
  });
});

describe('applyParsedFilters', () => {
  const current: ListingFilterValues = {
    ...EMPTY_FILTERS,
    sort: 'price_asc',
    districts: ['avan'],
    priceMax: 99_000_000,
    hasParking: true,
  };

  it('replaces the previous filters rather than merging with them', () => {
    const next = applyParsedFilters({ roomsMin: 3, roomsMax: 3 }, current);

    // A new sentence describes what the reader wants now; keeping "avan" from
    // the last one would answer neither sentence.
    expect(next.districts).toEqual([]);
    expect(next.priceMax).toBeUndefined();
    expect(next.hasParking).toBe(false);
    expect(next).toMatchObject({ roomsMin: 3, roomsMax: 3 });
  });

  it('keeps the sort, which is not part of the sentence', () => {
    expect(applyParsedFilters({}, current).sort).toBe('price_asc');
  });

  it('turns an absent flag into false rather than leaving it undefined', () => {
    const next = applyParsedFilters({ districts: ['kentron'] }, current);

    expect(next.excludeGroundFloor).toBe(false);
    expect(next.hasElevator).toBe(false);
    expect(next.buildingTypes).toEqual([]);
  });

  it('produces a chip for every filter the parse set', () => {
    const next = applyParsedFilters(
      {
        roomsMin: 2,
        roomsMax: 2,
        priceMax: 60_000_000,
        districts: ['arabkir'],
        excludeGroundFloor: true,
      },
      current,
    );

    expect(toChips(next, labels).map((chip) => chip.id)).toEqual([
      'priceMax',
      'rooms',
      'district:arabkir',
      'excludeGroundFloor',
    ]);
  });
});
