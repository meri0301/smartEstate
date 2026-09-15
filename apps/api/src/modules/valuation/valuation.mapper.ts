/**
 * Translation between a listing row, the ML service's vocabulary, and the
 * valuation the API publishes.
 *
 * Pure functions, so the arithmetic that turns a log contribution into a number
 * of dram can be tested without a model or a database behind it.
 */
import type { Valuation, ValuationFactor, ValuationVerdict } from '@smartestate/contracts';
import type { MlExplanation, MlListingFeatures } from '../../infrastructure/ml/ml.client.js';
import { toNullableNumber, toNumber, type ListingRow } from '../listings/listing-row.js';

/** The listing as the model expects to receive it. */
export function toFeatures(row: ListingRow): MlListingFeatures {
  return {
    totalArea: toNumber(row.total_area),
    rooms: row.rooms,
    floor: row.floor,
    totalFloors: row.b_total_floors,
    constructionYear: row.b_construction_year,
    districtSlug: row.d_slug,
    buildingType: row.b_building_type,
    condition: row.condition,
    heating: row.heating,
    ownershipDocs: row.ownership_docs,
    lat: row.lat,
    lon: row.lon,
    livingArea: toNullableNumber(row.living_area),
    kitchenArea: toNullableNumber(row.kitchen_area),
    bathrooms: row.bathrooms,
    ceilingHeight: toNullableNumber(row.ceiling_height),
    balconyCount: row.balcony_count,
    hasLoggia: row.has_loggia,
    hasParking: row.has_parking,
    hasStorage: row.has_storage,
    hasElevator: row.b_has_elevator,
    seismicRetrofit: row.b_seismic_retrofit,
  };
}

/**
 * How many dram a feature is worth, from its log contribution.
 *
 * The model is multiplicative, so a contribution `c` means this listing's
 * estimate is `exp(c)` times what it would be without that feature. The
 * difference between the two, `estimate × (1 − exp(−c))`, is the part of the
 * price attributable to it. Using `estimate × (exp(c) − 1)` instead would
 * overstate every positive factor, because it measures against the smaller
 * number rather than the one the reader is looking at.
 */
export function impactAmd(estimateAmd: number, logContribution: number): number {
  return Math.round(estimateAmd * (1 - Math.exp(-logContribution)));
}

/** Where the asking price sits against the model's own range. */
export function verdictFor(
  askingPriceAmd: number,
  lowerBoundAmd: number,
  upperBoundAmd: number,
): ValuationVerdict {
  if (askingPriceAmd < lowerBoundAmd) {
    return 'UNDERPRICED';
  }
  if (askingPriceAmd > upperBoundAmd) {
    return 'OVERPRICED';
  }
  return 'FAIR';
}

export interface ValuationInputs {
  listingId: string;
  askingPriceAmd: number;
  explanation: MlExplanation;
  calculatedAt: Date;
  isStale: boolean;
}

/** The published shape, with every figure rounded to whole dram. */
export function toValuation(inputs: ValuationInputs): Valuation {
  const { explanation, askingPriceAmd } = inputs;
  const fairPriceAmd = Math.max(0, Math.round(explanation.estimate.priceAmd));
  const lowerBoundAmd = Math.max(0, Math.round(explanation.estimate.lowPriceAmd));
  const upperBoundAmd = Math.max(0, Math.round(explanation.estimate.highPriceAmd));

  return {
    listingId: inputs.listingId,
    modelVersion: explanation.modelVersion,
    fairPriceAmd,
    lowerBoundAmd,
    upperBoundAmd,
    deviationPct: roundTo(
      explanation.deviation !== null
        ? explanation.deviation * 100
        : deviationOf(askingPriceAmd, fairPriceAmd),
      2,
    ),
    // The service returns a verdict whenever it is given an asking price; the
    // fallback keeps the field honest if a future caller omits one.
    verdict: explanation.verdict ?? verdictFor(askingPriceAmd, lowerBoundAmd, upperBoundAmd),
    factors: explanation.contributions.map((contribution): ValuationFactor => ({
      feature: contribution.feature,
      value: contribution.value,
      effect: roundTo(contribution.effect, 4),
      impactAmd: impactAmd(fairPriceAmd, contribution.logContribution),
    })),
    calculatedAt: inputs.calculatedAt.toISOString(),
    isStale: inputs.isStale,
  };
}

function deviationOf(askingPriceAmd: number, fairPriceAmd: number): number {
  return fairPriceAmd > 0 ? (askingPriceAmd / fairPriceAmd - 1) * 100 : 0;
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
