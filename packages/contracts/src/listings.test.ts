import { describe, expect, it } from 'vitest';
import {
  createListingBodySchema,
  listingSearchQuerySchema,
  updateListingBodySchema,
} from './listings.js';

describe('listingSearchQuerySchema', () => {
  it('applies defaults for an empty query', () => {
    const parsed = listingSearchQuerySchema.parse({});
    expect(parsed).toMatchObject({ limit: 20, sort: 'published_desc', status: 'PUBLISHED' });
  });

  it('coerces numeric strings and boolean flags from the query string', () => {
    const parsed = listingSearchQuerySchema.parse({
      priceMin: '30000000',
      roomsMax: '3',
      areaMin: '55.5',
      hasElevator: 'true',
      excludeGroundFloor: 'false',
      limit: '5',
    });
    expect(parsed.priceMin).toBe(30_000_000);
    expect(parsed.roomsMax).toBe(3);
    expect(parsed.areaMin).toBe(55.5);
    expect(parsed.hasElevator).toBe(true);
    expect(parsed.excludeGroundFloor).toBe(false);
    expect(parsed.limit).toBe(5);
  });

  it('accepts comma-separated and repeated list parameters', () => {
    expect(listingSearchQuerySchema.parse({ districts: 'kentron, arabkir' }).districts).toEqual([
      'kentron',
      'arabkir',
    ]);
    expect(
      listingSearchQuerySchema.parse({ buildingTypes: ['STONE', 'PANEL,MONOLITH'] }).buildingTypes,
    ).toEqual(['STONE', 'PANEL', 'MONOLITH']);
  });

  it('rejects unknown enum members in lists', () => {
    expect(listingSearchQuerySchema.safeParse({ buildingTypes: 'CASTLE' }).success).toBe(false);
  });

  it('rejects inverted ranges', () => {
    const result = listingSearchQuerySchema.safeParse({ priceMin: '100', priceMax: '50' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(['priceMax']);
    }
  });

  it('requires all radius parameters together', () => {
    expect(listingSearchQuerySchema.safeParse({ nearLat: '40.18' }).success).toBe(false);
    expect(
      listingSearchQuerySchema.safeParse({ nearLat: '40.18', nearLon: '44.51', radiusM: '1500' })
        .success,
    ).toBe(true);
  });

  it('parses and validates a bounding box', () => {
    const parsed = listingSearchQuerySchema.parse({ bbox: '44.40,40.10,44.60,40.25' });
    expect(parsed.bbox).toEqual({ minLon: 44.4, minLat: 40.1, maxLon: 44.6, maxLat: 40.25 });
    expect(listingSearchQuerySchema.safeParse({ bbox: '44.60,40.10,44.40,40.25' }).success).toBe(
      false,
    );
    expect(listingSearchQuerySchema.safeParse({ bbox: '1,2,3' }).success).toBe(false);
  });

  it('caps the page size', () => {
    expect(listingSearchQuerySchema.safeParse({ limit: '51' }).success).toBe(false);
  });
});

describe('createListingBodySchema', () => {
  const valid = {
    buildingId: '018f6d3e-7b6c-7c3a-9a0e-1f2b3c4d5e6f',
    priceAmd: 45_000_000,
    totalArea: 72,
    rooms: 3,
    floor: 4,
    condition: 'GOOD',
    heating: 'INDIVIDUAL_GAS_BOILER',
    translations: [
      { locale: 'en', title: 'Bright 3-room flat', description: 'Sunny apartment near Komitas.' },
    ],
  };

  it('fills defaults for optional attributes', () => {
    const parsed = createListingBodySchema.parse(valid);
    expect(parsed.priceNegotiable).toBe(false);
    expect(parsed.originalCurrency).toBe('AMD');
    expect(parsed.bathrooms).toBe(1);
    expect(parsed.ownershipDocs).toBe('UNVERIFIED');
  });

  it('rejects duplicate translation locales', () => {
    const result = createListingBodySchema.safeParse({
      ...valid,
      translations: [...valid.translations, ...valid.translations],
    });
    expect(result.success).toBe(false);
  });

  it('requires at least one translation', () => {
    expect(createListingBodySchema.safeParse({ ...valid, translations: [] }).success).toBe(false);
  });
});

describe('updateListingBodySchema', () => {
  it('rejects an empty update', () => {
    expect(updateListingBodySchema.safeParse({}).success).toBe(false);
  });

  it('rejects a status-only update, because status moves through transitions', () => {
    // Unknown keys are stripped, so the body is empty and fails the "at least one field" rule.
    expect(updateListingBodySchema.safeParse({ status: 'ARCHIVED' }).success).toBe(false);
  });
});
