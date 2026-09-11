import { describe, expect, it } from 'vitest';
import {
  BUILDING_TYPE_MULTIPLIER,
  CONDITION_MULTIPLIER,
  ceilingMultiplier,
  estimatePricePerSqmAmd,
  floorMultiplier,
  roundPriceAmd,
  roundToStep,
} from './pricing.js';

describe('multiplier tables', () => {
  it('orders building stock as the Yerevan market does', () => {
    expect(BUILDING_TYPE_MULTIPLIER.NEW_BUILD).toBeGreaterThan(BUILDING_TYPE_MULTIPLIER.MONOLITH);
    expect(BUILDING_TYPE_MULTIPLIER.STONE).toBeGreaterThan(BUILDING_TYPE_MULTIPLIER.PANEL);
    expect(BUILDING_TYPE_MULTIPLIER.PANEL).toBeGreaterThan(BUILDING_TYPE_MULTIPLIER.KHRUSHCHYOVKA);
  });

  it('orders renovation states monotonically', () => {
    expect(CONDITION_MULTIPLIER.DESIGNER).toBeGreaterThan(CONDITION_MULTIPLIER.EURO_RENOVATION);
    expect(CONDITION_MULTIPLIER.EURO_RENOVATION).toBeGreaterThan(CONDITION_MULTIPLIER.GOOD);
    expect(CONDITION_MULTIPLIER.GOOD).toBeGreaterThan(CONDITION_MULTIPLIER.OLD_RENOVATION);
    expect(CONDITION_MULTIPLIER.OLD_RENOVATION).toBeGreaterThan(CONDITION_MULTIPLIER.NEEDS_REPAIR);
  });
});

describe('floorMultiplier', () => {
  it('discounts ground floors and lift-less top floors', () => {
    expect(floorMultiplier(1, 9, true)).toBeLessThan(1);
    expect(floorMultiplier(5, 5, false)).toBeLessThan(floorMultiplier(5, 5, true));
    expect(floorMultiplier(3, 9, true)).toBeGreaterThan(1);
    expect(floorMultiplier(7, 16, true)).toBe(1);
  });
});

describe('ceilingMultiplier', () => {
  it('rewards tall ceilings and penalises low ones', () => {
    expect(ceilingMultiplier(3.3)).toBeGreaterThan(ceilingMultiplier(3.0));
    expect(ceilingMultiplier(3.0)).toBeGreaterThan(ceilingMultiplier(2.8));
    expect(ceilingMultiplier(2.5)).toBeLessThan(1);
  });
});

describe('estimatePricePerSqmAmd', () => {
  const base = {
    districtMedianPerSqmAmd: 900_000,
    buildingType: 'STONE',
    condition: 'GOOD',
    floor: 6,
    totalFloors: 9,
    hasElevator: true,
    ceilingHeightMeters: 2.8,
    noiseFactor: 1,
  } as const;

  it('returns the district median for a neutral apartment', () => {
    expect(estimatePricePerSqmAmd(base)).toBe(900_000);
  });

  it('stays within a plausible band for every combination', () => {
    for (const buildingType of Object.keys(
      BUILDING_TYPE_MULTIPLIER,
    ) as (keyof typeof BUILDING_TYPE_MULTIPLIER)[]) {
      for (const condition of Object.keys(
        CONDITION_MULTIPLIER,
      ) as (keyof typeof CONDITION_MULTIPLIER)[]) {
        const price = estimatePricePerSqmAmd({ ...base, buildingType, condition });
        expect(price).toBeGreaterThan(base.districtMedianPerSqmAmd * 0.5);
        expect(price).toBeLessThan(base.districtMedianPerSqmAmd * 1.6);
      }
    }
  });
});

describe('rounding', () => {
  it('roundToStep snaps to the nearest multiple', () => {
    expect(roundToStep(1_249_999, 100_000)).toBe(1_200_000);
    expect(roundToStep(1_250_000, 100_000)).toBe(1_300_000);
  });

  it('roundToStep rejects non-positive steps', () => {
    expect(() => roundToStep(10, 0)).toThrow(RangeError);
  });

  it('roundPriceAmd returns a BigInt in hundreds of thousands', () => {
    expect(roundPriceAmd(54_321_098)).toBe(54_300_000n);
  });
});
