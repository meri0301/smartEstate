import { describe, expect, it } from 'vitest';
import {
  MODERATE_EVIDENCE_AT,
  STRONG_EVIDENCE_AT,
  confidenceOf,
  evidenceOf,
  grossRentalYieldPct,
} from './quote.js';
import { toFeatures } from './quote.service.js';
import type { DistrictStock } from './quote.repository.js';

const stock: DistrictStock = {
  lat: 40.19,
  lon: 44.5,
  medianConstructionYear: 1968,
  commonestHeating: 'INDIVIDUAL_GAS_BOILER',
  medianCeilingHeight: 3.01,
  medianLivingAreaRatio: 0.6,
  medianKitchenAreaRatio: 0.14,
  medianBathrooms: 1,
  medianBalconyCount: 1,
};

const request = {
  districtSlug: 'kentron',
  rooms: 2,
  totalArea: 63.1,
  floor: 3,
  totalFloors: 4,
  buildingType: 'STONE',
  condition: 'GOOD',
  askingPriceAmd: 57_615_000,
} as const;

describe('confidenceOf', () => {
  it('scores a tight range higher than a wide one', () => {
    const tight = confidenceOf({
      fairPriceAmd: 50_000_000,
      lowerBoundAmd: 45_000_000,
      upperBoundAmd: 55_000_000,
    });
    const wide = confidenceOf({
      fairPriceAmd: 50_000_000,
      lowerBoundAmd: 30_000_000,
      upperBoundAmd: 70_000_000,
    });
    // ±10% is a width of 20% of the estimate, so 0.8; ±40% is 0.2.
    expect(tight).toBeCloseTo(0.8, 10);
    expect(wide).toBeCloseTo(0.2, 10);
  });

  it('floors at zero rather than going negative on a range wider than the estimate', () => {
    expect(
      confidenceOf({
        fairPriceAmd: 10_000_000,
        lowerBoundAmd: 1_000_000,
        upperBoundAmd: 30_000_000,
      }),
    ).toBe(0);
  });

  it('is zero when there is no estimate to be confident about', () => {
    expect(confidenceOf({ fairPriceAmd: 0, lowerBoundAmd: 0, upperBoundAmd: 0 })).toBe(0);
  });
});

describe('evidenceOf', () => {
  it('calls the catalogue thin below the first threshold', () => {
    expect(evidenceOf(0)).toBe('THIN');
    expect(evidenceOf(MODERATE_EVIDENCE_AT - 1)).toBe('THIN');
  });

  it('moves up at each threshold, not past it', () => {
    expect(evidenceOf(MODERATE_EVIDENCE_AT)).toBe('MODERATE');
    expect(evidenceOf(STRONG_EVIDENCE_AT - 1)).toBe('MODERATE');
    expect(evidenceOf(STRONG_EVIDENCE_AT)).toBe('STRONG');
  });
});

describe('grossRentalYieldPct', () => {
  it('is a year of rent over the price', () => {
    // 300k a month on 45m is 3.6m a year, which is 8%.
    expect(grossRentalYieldPct(300_000, 45_000_000)).toBeCloseTo(8, 10);
  });
});

describe('toFeatures', () => {
  it('prefers what the reader answered over the district', () => {
    const { features, assumptions } = toFeatures(
      { ...request, constructionYear: 1961, heating: 'ELECTRIC' },
      stock,
    );

    expect(features.constructionYear).toBe(1961);
    expect(features.heating).toBe('ELECTRIC');
    expect(assumptions.map((entry) => entry.field)).not.toContain('constructionYear');
    expect(assumptions.map((entry) => entry.field)).not.toContain('heating');
  });

  it('fills a blank from the district and says so', () => {
    const { features, assumptions } = toFeatures(request, stock);

    expect(features.constructionYear).toBe(1968);
    expect(features.heating).toBe('INDIVIDUAL_GAS_BOILER');
    expect(assumptions).toContainEqual({ field: 'constructionYear', value: '1968' });
    expect(assumptions).toContainEqual({ field: 'heating', value: 'INDIVIDUAL_GAS_BOILER' });
  });

  it('never sends an unknown ceiling height, because the model prices that down', () => {
    // The defect this guards: nulls do not describe an unremarkable property,
    // they describe an undescribed one, and the model has barely seen those.
    const { features } = toFeatures(request, stock);

    expect(features.ceilingHeight).toBe(3.01);
    expect(features.livingArea).not.toBeNull();
    expect(features.kitchenArea).not.toBeNull();
  });

  it('scales the interior to the property rather than copying the district’s sizes', () => {
    const small = toFeatures({ ...request, totalArea: 40 }, stock).features;
    const large = toFeatures({ ...request, totalArea: 100 }, stock).features;

    expect(small.livingArea).toBe(24);
    expect(large.livingArea).toBe(60);
  });

  it('falls back when a district has published nothing at all', () => {
    const empty: DistrictStock = {
      lat: 40.79,
      lon: 43.85,
      medianConstructionYear: undefined,
      commonestHeating: undefined,
      medianCeilingHeight: undefined,
      medianLivingAreaRatio: undefined,
      medianKitchenAreaRatio: undefined,
      medianBathrooms: undefined,
      medianBalconyCount: undefined,
    };
    const { features } = toFeatures(request, empty);

    expect(features.constructionYear).toBe(1975);
    expect(features.heating).toBe('CENTRAL_GAS');
    expect(features.ceilingHeight).toBe(2.7);
  });

  it('always reports the two substitutions it cannot avoid', () => {
    // There is no address and no room-by-room detail in the request, so both
    // are stood in for on every quote, however much the reader filled in.
    const { assumptions } = toFeatures(
      { ...request, constructionYear: 1961, heating: 'ELECTRIC' },
      stock,
    );

    expect(assumptions.map((entry) => entry.field)).toEqual(['coordinates', 'interior']);
  });

  it('keeps the reader’s notes away from the model', () => {
    const { features } = toFeatures({ ...request, notes: 'south facing, noisy road' }, stock);

    expect(JSON.stringify(features)).not.toContain('noisy');
  });
});
