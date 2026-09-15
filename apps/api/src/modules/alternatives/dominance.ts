/**
 * Comparing two listings, and deciding whether one is simply better.
 *
 * The relation is Pareto dominance: an alternative dominates the listing being
 * viewed when it is at least as good on every criterion compared and better on
 * at least one. That is a strong claim and a rare one, which is exactly why it
 * is worth making — a buyer told "this is better in every respect" can act on it
 * without weighing anything, and no weighting had to be invented to say so.
 *
 * Two decisions make it work on real data.
 *
 * **Indifference thresholds.** Exact equality between two prices never happens,
 * so a naive comparison finds a winner on every criterion and dominance
 * nowhere. Each criterion therefore has a difference below which the two are
 * treated as the same — the idea comes from outranking methods, where a
 * criterion with such a threshold is a pseudo-criterion rather than a true one
 * (Roy, 1991). The thresholds are set to what a buyer would actually notice,
 * and are named constants because a reader is entitled to disagree with them.
 *
 * **Droppable criteria.** Location needs a place the buyer named and value needs
 * the model service. When either is missing it is left out of the comparison
 * entirely rather than defaulted, and the response says so, because dominance
 * established over five criteria is a weaker statement than the same result over
 * seven.
 */
import type {
  ComparisonCriterion,
  CriterionComparison,
  DominanceRelation,
} from '@smartestate/contracts';
import { buildingScore, conditionScore, haversineMetres } from '../recommendations/criteria.js';
import { toNumber, type ListingRow } from '../listings/listing-row.js';

/**
 * How much two values have to differ before the difference is a reason.
 *
 * Expressed in each criterion's own unit. The price threshold is relative
 * because a difference that matters on a 20M flat is noise on a 200M one; the
 * rest are absolute, because a square metre is a square metre.
 */
export const PRICE_INDIFFERENCE_RATIO = 0.02;
export const INDIFFERENCE: Readonly<Record<ComparisonCriterion, number>> = {
  /** Unused: price uses the ratio above. Kept so the record is total. */
  price: 0,
  /** Two square metres. Below that the floor plan matters more than the number. */
  area: 2,
  /** The condition scale steps by 0.15 at its narrowest, so anything smaller is a tie. */
  condition: 0.1,
  /** The building score combines four things; a tenth of it is a real difference. */
  building: 0.1,
  /** The floor score is effectively banded, so only a clear gap counts. */
  floor: 0.1,
  /** Two hundred metres is about two minutes' walk. */
  location: 200,
  /** Two percentage points against the model's estimate is inside its own error. */
  value: 2,
};

/** Which direction is an improvement, and what the numbers mean. */
const DIRECTION: Readonly<Record<ComparisonCriterion, 'higher' | 'lower'>> = {
  price: 'lower',
  area: 'higher',
  condition: 'higher',
  building: 'higher',
  floor: 'higher',
  location: 'lower',
  value: 'lower',
};

const UNITS: Readonly<Record<ComparisonCriterion, CriterionComparison['unit']>> = {
  price: 'amd',
  area: 'sqm',
  condition: 'score',
  building: 'score',
  floor: 'score',
  location: 'metres',
  value: 'percent',
};

/** One listing reduced to the numbers it is compared on. */
export type ComparableVector = Partial<Record<ComparisonCriterion, number>>;

export interface ComparisonContext {
  /** Where the buyer commutes to, when they said. Enables the location criterion. */
  anchor?: { lat: number; lon: number } | undefined;
  /** Asking price against the model's estimate, per listing id. Enables `value`. */
  deviations?: ReadonlyMap<string, number> | undefined;
}

/**
 * How bad a floor is, as one number.
 *
 * The ground floor and the top floor of a building with no lift are the two
 * positions people actively avoid, and both are objective. Everything else is
 * the same as everything else: preferring the fourth floor to the fifth is
 * taste, and taste has no place in a dominance claim.
 */
export function floorScore(floor: number, totalFloors: number, hasElevator: boolean): number {
  if (floor <= 1) {
    return 0;
  }
  if (floor >= totalFloors && !hasElevator) {
    return 0.5;
  }
  return 1;
}

/** Reduces a listing to the criteria that can be compared for it. */
export function toComparable(row: ListingRow, context: ComparisonContext = {}): ComparableVector {
  const vector: ComparableVector = {
    price: Number(String(row.price_amd)),
    area: toNumber(row.total_area),
    condition: conditionScore(row.condition),
    building: buildingScore({
      buildingType: row.b_building_type,
      constructionYear: row.b_construction_year,
      totalFloors: row.b_total_floors,
      hasElevator: row.b_has_elevator,
      seismicRetrofit: row.b_seismic_retrofit,
    }),
    floor: floorScore(row.floor, row.b_total_floors, row.b_has_elevator),
  };
  if (context.anchor !== undefined) {
    vector.location = haversineMetres(context.anchor, { lat: row.lat, lon: row.lon });
  }
  const deviation = context.deviations?.get(row.id);
  if (deviation !== undefined) {
    vector.value = deviation;
  }
  return vector;
}

/** The criteria both vectors carry a value for. */
export function comparableCriteria(
  subject: ComparableVector,
  alternative: ComparableVector,
): ComparisonCriterion[] {
  return (Object.keys(DIRECTION) as ComparisonCriterion[]).filter(
    (criterion) => subject[criterion] !== undefined && alternative[criterion] !== undefined,
  );
}

/**
 * Whether a difference on one criterion is large enough to be a reason.
 *
 * Price scales with the amount; everything else has a fixed threshold. Returns
 * the direction from the alternative's point of view.
 */
export function compareOne(
  criterion: ComparisonCriterion,
  subject: number,
  alternative: number,
): CriterionComparison['direction'] {
  const threshold =
    criterion === 'price' ? Math.abs(subject) * PRICE_INDIFFERENCE_RATIO : INDIFFERENCE[criterion];
  const difference = alternative - subject;
  if (Math.abs(difference) <= threshold) {
    return 'same';
  }
  const improved = DIRECTION[criterion] === 'higher' ? difference > 0 : difference < 0;
  return improved ? 'better' : 'worse';
}

export interface Comparison {
  relation: DominanceRelation;
  comparisons: CriterionComparison[];
  betterCount: number;
  worseCount: number;
}

/**
 * Compares an alternative against the listing being viewed.
 *
 * The result is ordered gains first, then losses, then ties, because that is the
 * order somebody reads it in: what do I get, what does it cost me, and what
 * stays the same. A listing that is worse on everything is still described
 * honestly here — leaving it out is the caller's decision, not this function's.
 */
export function compare(subject: ComparableVector, alternative: ComparableVector): Comparison {
  const comparisons: CriterionComparison[] = [];
  let betterCount = 0;
  let worseCount = 0;

  for (const criterion of comparableCriteria(subject, alternative)) {
    const subjectValue = subject[criterion] ?? 0;
    const alternativeValue = alternative[criterion] ?? 0;
    const direction = compareOne(criterion, subjectValue, alternativeValue);
    if (direction === 'better') {
      betterCount += 1;
    } else if (direction === 'worse') {
      worseCount += 1;
    }
    comparisons.push({
      criterion,
      direction,
      subject: round(subjectValue),
      alternative: round(alternativeValue),
      unit: UNITS[criterion],
    });
  }

  comparisons.sort(byGainsThenLosses);

  return {
    relation: relationOf(betterCount, worseCount),
    comparisons,
    betterCount,
    worseCount,
  };
}

/**
 * Pareto dominance, stated plainly.
 *
 * Better on something and worse on nothing is dominance. Better on nothing and
 * worse on nothing is equivalence. Everything else is a trade-off — including
 * the case where the alternative is worse on something and better on nothing,
 * which is a trade-off with nothing on the buyer's side of it and is why the
 * service filters those out rather than showing them.
 */
export function relationOf(betterCount: number, worseCount: number): DominanceRelation {
  if (worseCount === 0) {
    return betterCount > 0 ? 'DOMINATES' : 'EQUIVALENT';
  }
  return 'TRADE_OFF';
}

const ORDER: Readonly<Record<CriterionComparison['direction'], number>> = {
  better: 0,
  worse: 1,
  same: 2,
};

function byGainsThenLosses(a: CriterionComparison, b: CriterionComparison): number {
  return ORDER[a.direction] - ORDER[b.direction];
}

function round(value: number): number {
  return Math.round(value * 1e4) / 1e4;
}
