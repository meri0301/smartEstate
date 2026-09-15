import { describe, expect, it } from 'vitest';
import {
  activeFilterCount,
  DEFAULT_SORT,
  EMPTY_FILTERS,
  hasActiveFilters,
  isBbox,
  PAGE_SIZE,
  parseFilters,
  toQuery,
  toSearchParams,
  type ListingFilterValues,
} from './filters.js';

const parse = (query: string): ListingFilterValues => parseFilters(new URLSearchParams(query));

describe('parseFilters', () => {
  it('returns the empty set for an empty query string', () => {
    expect(parse('')).toEqual(EMPTY_FILTERS);
  });

  it('reads numbers, lists and flags', () => {
    const values = parse(
      'priceMin=30000000&priceMax=60000000&roomsMin=2&areaMin=65.5&districts=kentron,arabkir&buildingTypes=STONE&hasElevator=true',
    );
    expect(values.priceMin).toBe(30_000_000);
    expect(values.priceMax).toBe(60_000_000);
    expect(values.roomsMin).toBe(2);
    expect(values.areaMin).toBe(65.5);
    expect(values.districts).toEqual(['kentron', 'arabkir']);
    expect(values.buildingTypes).toEqual(['STONE']);
    expect(values.hasElevator).toBe(true);
    expect(values.hasParking).toBe(false);
  });

  it('drops values the API would reject rather than searching with them', () => {
    const values = parse(
      'priceMin=-5&roomsMin=abc&areaMin=0&districts=Kentron,../etc,arabkir&buildingTypes=CASTLE,PANEL&conditions=SPOTLESS&sort=cheapest',
    );
    expect(values.priceMin).toBeUndefined();
    expect(values.roomsMin).toBeUndefined();
    expect(values.areaMin).toBeUndefined();
    expect(values.districts).toEqual(['arabkir']);
    expect(values.buildingTypes).toEqual(['PANEL']);
    expect(values.conditions).toEqual([]);
    expect(values.sort).toBe(DEFAULT_SORT);
  });

  it('removes duplicates from a list', () => {
    expect(parse('districts=kentron,kentron,arabkir').districts).toEqual(['kentron', 'arabkir']);
  });

  it('accepts a well-formed bounding box and ignores a malformed one', () => {
    expect(parse('bbox=44.4,40.1,44.6,40.3').bbox).toBe('44.4,40.1,44.6,40.3');
    expect(parse('bbox=44.6,40.3,44.4,40.1').bbox).toBeUndefined();
    expect(parse('bbox=44.4,40.1').bbox).toBeUndefined();
  });
});

describe('isBbox', () => {
  it.each([
    ['44.4,40.1,44.6,40.3', true],
    ['44.6,40.1,44.4,40.3', false],
    ['44.4,40.3,44.6,40.1', false],
    ['a,b,c,d', false],
    ['1,2,3', false],
  ])('%s', (value, expected) => {
    expect(isBbox(value)).toBe(expected);
  });
});

describe('toSearchParams', () => {
  it('writes nothing for an unfiltered search', () => {
    expect(toSearchParams(EMPTY_FILTERS).toString()).toBe('');
  });

  it('omits the default sort but keeps any other', () => {
    expect(toSearchParams({ ...EMPTY_FILTERS, sort: DEFAULT_SORT }).has('sort')).toBe(false);
    expect(toSearchParams({ ...EMPTY_FILTERS, sort: 'price_asc' }).get('sort')).toBe('price_asc');
  });

  it('round-trips every field', () => {
    const values: ListingFilterValues = {
      sort: 'price_per_sqm_asc',
      priceMin: 30_000_000,
      priceMax: 60_000_000,
      roomsMin: 2,
      roomsMax: 4,
      areaMin: 65,
      areaMax: 120,
      yearMin: 1990,
      districts: ['kentron', 'arabkir'],
      buildingTypes: ['STONE', 'MONOLITH'],
      conditions: ['GOOD'],
      hasElevator: true,
      hasParking: true,
      docsVerified: true,
      excludeGroundFloor: true,
      excludeTopFloor: true,
      bbox: '44.4,40.1,44.6,40.3',
    };
    expect(parseFilters(toSearchParams(values))).toEqual(values);
  });
});

describe('toQuery', () => {
  it('always asks for one page and the reader’s language', () => {
    const query = toQuery(EMPTY_FILTERS, 'hy');
    expect(query).toEqual({ limit: PAGE_SIZE, locale: 'hy' });
  });

  it('sends numbers as numbers and lists and flags as strings', () => {
    const query = toQuery(
      { ...EMPTY_FILTERS, priceMin: 30_000_000, districts: ['kentron'], hasElevator: true },
      'en',
    );
    expect(query).toMatchObject({
      priceMin: 30_000_000,
      districts: 'kentron',
      hasElevator: 'true',
    });
  });

  it('keeps a bounding box as the string the API parses', () => {
    expect(toQuery({ ...EMPTY_FILTERS, bbox: '44.4,40.1,44.6,40.3' }, 'en')).toMatchObject({
      bbox: '44.4,40.1,44.6,40.3',
    });
  });
});

describe('activeFilterCount', () => {
  it('ignores the sort, which is not a filter', () => {
    expect(activeFilterCount({ ...EMPTY_FILTERS, sort: 'price_asc' })).toBe(0);
    expect(hasActiveFilters({ ...EMPTY_FILTERS, sort: 'price_asc' })).toBe(false);
  });

  it('counts one per parameter, however many members a list has', () => {
    expect(
      activeFilterCount({ ...EMPTY_FILTERS, districts: ['kentron', 'arabkir'], priceMin: 1 }),
    ).toBe(2);
    expect(hasActiveFilters({ ...EMPTY_FILTERS, priceMin: 1 })).toBe(true);
  });
});
