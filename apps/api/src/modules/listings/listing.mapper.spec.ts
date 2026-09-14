import { describe, expect, it } from 'vitest';
import type { ListingRow } from './listing-row.js';
import {
  toListingDetail,
  toListingSummary,
  type MediaRecord,
  type TranslationRecord,
} from './listing.mapper.js';

const row: ListingRow = {
  id: '018f6d3e-7b6c-7c3a-9a0e-1f2b3c4d5e6f',
  public_id: 'L-ABC234',
  status: 'ACTIVE',
  price_amd: 45_000_000n,
  price_per_sqm_amd: 625_000,
  original_currency: 'USD',
  original_price: { toString: () => '116500.00' },
  price_negotiable: true,
  rooms: 3,
  bathrooms: 1,
  total_area: { toString: () => '72.00' },
  living_area: null,
  kitchen_area: { toString: () => '9.50' },
  ceiling_height: { toString: () => '2.80' },
  floor: 4,
  balcony_count: 1,
  has_loggia: false,
  has_parking: false,
  has_storage: true,
  condition: 'GOOD',
  heating: 'INDIVIDUAL_GAS_BOILER',
  ownership_docs: 'VERIFIED',
  lon: 44.51,
  lat: 40.18,
  published_at: new Date('2026-08-20T10:00:00.000Z'),
  created_at: new Date('2026-08-20T10:00:00.000Z'),
  updated_at: new Date('2026-08-21T10:00:00.000Z'),
  created_by_id: null,
  building_id: '018f6d3e-7b6c-7c3a-9a0e-1f2b3c4d5e70',
  district_id: '018f6d3e-7b6c-7c3a-9a0e-1f2b3c4d5e71',
  b_address_line: 'Komitas 12',
  b_street_hy: 'Կոմիտաս',
  b_street_ru: 'Комитаса',
  b_street_en: 'Komitas',
  b_house_number: '12',
  b_building_type: 'STONE',
  b_construction_year: 1978,
  b_total_floors: 9,
  b_has_elevator: true,
  b_seismic_retrofit: false,
  b_lon: 44.51,
  b_lat: 40.18,
  d_slug: 'arabkir',
  d_name_hy: 'Արաբկիր',
  d_name_ru: 'Арабкир',
  d_name_en: 'Arabkir',
};

const translations = [
  {
    listingId: row.id,
    locale: 'hy',
    title: 'Հայերեն',
    description: 'Նկարագրություն',
    source: 'HUMAN',
    isReviewed: true,
    updatedAt: new Date(),
  },
  {
    listingId: row.id,
    locale: 'en',
    title: 'English',
    description: 'Description',
    source: 'MACHINE',
    isReviewed: false,
    updatedAt: new Date(),
  },
] as TranslationRecord[];

const media = [
  {
    id: 'm1',
    listingId: row.id,
    kind: 'PHOTO',
    url: 'https://img.test/1.jpg',
    width: 1200,
    height: 800,
    sortOrder: 0,
    perceptualHash: null,
    isPlaceholder: true,
    createdAt: new Date(),
  },
] as MediaRecord[];

describe('toListingSummary', () => {
  it('normalises numeric types and picks the requested locale', () => {
    const summary = toListingSummary(row, translations, media[0], 'hy');
    expect(summary.priceAmd).toBe(45_000_000);
    expect(summary.originalPrice).toBe(116_500);
    expect(summary.totalArea).toBe(72);
    expect(summary.title).toBe('Հայերեն');
    expect(summary.locale).toBe('hy');
    expect(summary.totalFloors).toBe(9);
    expect(summary.district).toEqual({
      slug: 'arabkir',
      name: { hy: 'Արաբկիր', ru: 'Арабкир', en: 'Arabkir' },
    });
    expect(summary.thumbnailUrl).toBe('https://img.test/1.jpg');
    expect(summary.publishedAt).toBe('2026-08-20T10:00:00.000Z');
  });

  it('falls back to English and reports the locale actually used', () => {
    const summary = toListingSummary(row, translations, undefined, 'ru');
    expect(summary.title).toBe('English');
    expect(summary.locale).toBe('en');
    expect(summary.thumbnailUrl).toBeNull();
  });

  it('survives a listing without any translation', () => {
    expect(toListingSummary(row, [], undefined, 'hy').title).toBe('Untitled listing');
  });
});

describe('toListingDetail', () => {
  it('includes building, media, translations and price history', () => {
    const detail = toListingDetail(
      row,
      translations,
      media,
      [
        {
          id: 'h1',
          listingId: row.id,
          priceAmd: 47_000_000n,
          recordedAt: new Date('2026-08-01T00:00:00.000Z'),
        },
      ],
      'en',
    );
    expect(detail.description).toBe('Description');
    expect(detail.kitchenArea).toBe(9.5);
    expect(detail.livingArea).toBeNull();
    expect(detail.building.street.en).toBe('Komitas');
    expect(detail.translations.map((t) => t.isMachineTranslated)).toEqual([false, true]);
    expect(detail.priceHistory).toEqual([
      { priceAmd: 47_000_000, recordedAt: '2026-08-01T00:00:00.000Z' },
    ]);
    expect(detail.media[0]?.isPlaceholder).toBe(true);
  });
});
