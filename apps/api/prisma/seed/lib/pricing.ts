/**
 * Synthetic price model for the seed.
 *
 * Prices are generated as district median price per m² multiplied by
 * well-known Yerevan market effects (building stock, renovation state, floor,
 * ceiling height) and multiplicative noise. The multipliers are deliberately
 * explicit so the ML valuation model (Phase 7) has a known structure to recover
 * and the thesis can compare learned coefficients against them.
 */
import type { BuildingType, Condition } from '../../../src/generated/prisma/enums.js';

export const BUILDING_TYPE_MULTIPLIER: Readonly<Record<BuildingType, number>> = {
  NEW_BUILD: 1.2,
  MONOLITH: 1.15,
  STALINKA: 1.05,
  STONE: 1.0,
  PANEL: 0.85,
  KHRUSHCHYOVKA: 0.78,
};

export const CONDITION_MULTIPLIER: Readonly<Record<Condition, number>> = {
  DESIGNER: 1.25,
  EURO_RENOVATION: 1.12,
  GOOD: 1.0,
  OLD_RENOVATION: 0.88,
  NEEDS_REPAIR: 0.75,
};

/** Ground floors and lift-less top floors are discounted; 2nd–4th floors carry a premium. */
export function floorMultiplier(floor: number, totalFloors: number, hasElevator: boolean): number {
  if (floor <= 1) {
    return 0.94;
  }
  if (floor === totalFloors) {
    return hasElevator ? 0.98 : 0.95;
  }
  if (floor >= 2 && floor <= 4) {
    return 1.03;
  }
  if (!hasElevator && floor >= 5) {
    return 0.97;
  }
  return 1.0;
}

/** Ceilings above 3 m are a valued feature of Yerevan's older stone stock. */
export function ceilingMultiplier(ceilingHeightMeters: number): number {
  if (ceilingHeightMeters >= 3.2) {
    return 1.05;
  }
  if (ceilingHeightMeters >= 3.0) {
    return 1.03;
  }
  if (ceilingHeightMeters < 2.6) {
    return 0.98;
  }
  return 1.0;
}

export interface PriceInput {
  districtMedianPerSqmAmd: number;
  buildingType: BuildingType;
  condition: Condition;
  floor: number;
  totalFloors: number;
  hasElevator: boolean;
  ceilingHeightMeters: number;
  /** Multiplicative noise, median 1 (see Rng.logNormalFactor). */
  noiseFactor: number;
}

export function estimatePricePerSqmAmd(input: PriceInput): number {
  const value =
    input.districtMedianPerSqmAmd *
    BUILDING_TYPE_MULTIPLIER[input.buildingType] *
    CONDITION_MULTIPLIER[input.condition] *
    floorMultiplier(input.floor, input.totalFloors, input.hasElevator) *
    ceilingMultiplier(input.ceilingHeightMeters) *
    input.noiseFactor;
  return Math.round(value);
}

export function roundToStep(value: number, step: number): number {
  if (step <= 0) {
    throw new RangeError('roundToStep(): step must be positive');
  }
  return Math.round(value / step) * step;
}

/** Asking prices in AMD are quoted in round hundreds of thousands. */
export function roundPriceAmd(priceAmd: number, step = 100_000): bigint {
  return BigInt(roundToStep(priceAmd, step));
}
