import { describe, expect, it } from 'vitest';
import type { MlExplanation } from '../../infrastructure/ml/ml.client.js';
import type { ListingRow } from '../listings/listing-row.js';
import { impactAmd, toFeatures, toValuation, verdictFor } from './valuation.mapper.js';

const row: ListingRow = {
  id: '018f6d3e-7b6c-7c3a-9a0e-1f2b3c4d5e6f',
  public_id: 'L-ABC234',
  status: 'PUBLISHED',
  price_amd: 45_000_000n,
  price_per_sqm_amd: 625_000,
  original_currency: 'AMD',
  original_price: null,
  price_negotiable: false,
  rooms: 3,
  bathrooms: 2,
  total_area: { toString: () => '72.00' },
  living_area: { toString: () => '48.00' },
  kitchen_area: null,
  ceiling_height: { toString: () => '2.80' },
  floor: 4,
  balcony_count: 1,
  has_loggia: false,
  has_parking: true,
  has_storage: false,
  condition: 'GOOD',
  heating: 'CENTRAL_GAS',
  ownership_docs: 'VERIFIED',
  lon: 44.51,
  lat: 40.18,
  published_at: new Date('2026-08-20T10:00:00.000Z'),
  submitted_at: null,
  reviewed_at: null,
  reviewed_by_id: null,
  rejection_reason: null,
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

const explanation: MlExplanation = {
  modelVersion: 'valuation-lgbm-20260914-65982e00',
  estimate: {
    pricePerSqmAmd: 550_000,
    priceAmd: 39_600_000,
    lowPriceAmd: 30_000_000,
    highPriceAmd: 50_000_000,
  },
  baselinePricePerSqmAmd: 500_000,
  contributions: [
    { feature: 'district_slug', value: 'arabkir', effect: 0.2, logContribution: 0.1823 },
    { feature: 'floor', value: 4, effect: -0.05, logContribution: -0.0513 },
  ],
  deviation: 0.136_363_6,
  verdict: 'FAIR',
};

describe('toFeatures', () => {
  it('sends the listing and its building as one flat record', () => {
    expect(toFeatures(row)).toEqual({
      totalArea: 72,
      rooms: 3,
      floor: 4,
      totalFloors: 9,
      constructionYear: 1978,
      districtSlug: 'arabkir',
      buildingType: 'STONE',
      condition: 'GOOD',
      heating: 'CENTRAL_GAS',
      ownershipDocs: 'VERIFIED',
      lat: 40.18,
      lon: 44.51,
      livingArea: 48,
      kitchenArea: null,
      bathrooms: 2,
      ceilingHeight: 2.8,
      balconyCount: 1,
      hasLoggia: false,
      hasParking: true,
      hasStorage: false,
      hasElevator: true,
      seismicRetrofit: false,
    });
  });

  it('keeps an unmeasured room missing rather than calling it zero', () => {
    expect(toFeatures(row).kitchenArea).toBeNull();
  });
});

describe('impactAmd', () => {
  it('is the part of the estimate that would disappear without the feature', () => {
    // exp(0.1823) ≈ 1.2, so a fifth of the estimate comes from this feature:
    // 39.6M without it would be 33M, a difference of 6.6M.
    expect(impactAmd(39_600_000, 0.1823)).toBeCloseTo(6_600_000, -4);
  });

  it('is negative for a feature that holds the price down', () => {
    expect(impactAmd(39_600_000, -0.0513)).toBeLessThan(0);
  });

  it('is zero for a feature that changed nothing', () => {
    expect(impactAmd(39_600_000, 0)).toBe(0);
  });

  it('never exceeds the estimate itself, however large the contribution', () => {
    expect(impactAmd(39_600_000, 5)).toBeLessThan(39_600_000);
  });
});

describe('verdictFor', () => {
  it.each([
    [29_000_000, 'UNDERPRICED'],
    [30_000_000, 'FAIR'],
    [40_000_000, 'FAIR'],
    [50_000_000, 'FAIR'],
    [51_000_000, 'OVERPRICED'],
  ])('calls %d %s', (price, expected) => {
    expect(verdictFor(price, 30_000_000, 50_000_000)).toBe(expected);
  });
});

describe('toValuation', () => {
  const calculatedAt = new Date('2026-09-15T08:00:00.000Z');
  const valuation = toValuation({
    listingId: row.id,
    askingPriceAmd: 45_000_000,
    explanation,
    calculatedAt,
    isStale: false,
  });

  it('publishes whole dram and a percentage, not the model’s raw fractions', () => {
    expect(valuation.fairPriceAmd).toBe(39_600_000);
    expect(valuation.lowerBoundAmd).toBe(30_000_000);
    expect(valuation.upperBoundAmd).toBe(50_000_000);
    expect(valuation.deviationPct).toBe(13.64);
  });

  it('carries the model version, because every stored figure cites one', () => {
    expect(valuation.modelVersion).toBe('valuation-lgbm-20260914-65982e00');
    expect(valuation.calculatedAt).toBe(calculatedAt.toISOString());
  });

  it('turns each contribution into an effect and an amount', () => {
    expect(valuation.factors).toHaveLength(2);
    const [district] = valuation.factors;
    expect(district?.feature).toBe('district_slug');
    expect(district?.value).toBe('arabkir');
    expect(district?.effect).toBe(0.2);
    expect(district?.impactAmd).toBeGreaterThan(0);
  });

  it('computes a deviation itself when the model was not given an asking price', () => {
    const withoutDeviation = toValuation({
      listingId: row.id,
      askingPriceAmd: 45_000_000,
      explanation: { ...explanation, deviation: null, verdict: null },
      calculatedAt,
      isStale: false,
    });

    expect(withoutDeviation.deviationPct).toBe(13.64);
    expect(withoutDeviation.verdict).toBe('FAIR');
  });

  it('never publishes a negative price', () => {
    const negative = toValuation({
      listingId: row.id,
      askingPriceAmd: 45_000_000,
      explanation: {
        ...explanation,
        estimate: { ...explanation.estimate, lowPriceAmd: -1_000 },
      },
      calculatedAt,
      isStale: false,
    });

    expect(negative.lowerBoundAmd).toBe(0);
  });
});
