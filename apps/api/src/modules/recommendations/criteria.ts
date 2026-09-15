/**
 * Scoring one listing on each criterion, from 0 to 1.
 *
 * This is the part of the recommender a reader is entitled to argue with, so
 * every curve below is written out rather than fitted, and every constant is
 * named and justified. The defence of the whole design is that a buyer can be
 * told "this scored 0.8 on price because it is 20% under your budget", and
 * check it.
 *
 * Two conventions hold throughout. Higher is always better, so a criterion never
 * has to carry a direction alongside it. And every score is clamped to [0, 1],
 * so no single criterion can dominate a weighted sum by running away.
 */
import type { PreferenceProfile, RankingCriterion } from '@smartestate/contracts';
import { toNumber, type ListingRow } from '../listings/listing-row.js';

/** Metres, for the great-circle distance used by the location criterion. */
const EARTH_RADIUS_M = 6_371_000;

/**
 * Distance at which the location score reaches zero.
 *
 * Eight kilometres is roughly the width of Yerevan's built-up area, so a listing
 * on the far side of the city from the buyer's anchor scores nothing, and one
 * next door scores one.
 */
const LOCATION_HORIZON_M = 8_000;

/**
 * How far under the model's estimate counts as full marks on value, and how far
 * over counts as none. Twenty per cent either way is wider than the noise in the
 * data and narrower than the range a mispriced listing reaches.
 */
const VALUE_BAND = 0.2;

/** Ordinal desirability of the building stock, from the same market facts the seed encodes. */
const BUILDING_TYPE_SCORE: Readonly<Record<string, number>> = {
  NEW_BUILD: 1,
  MONOLITH: 0.9,
  STONE: 0.7,
  STALINKA: 0.65,
  PANEL: 0.35,
  KHRUSHCHYOVKA: 0.2,
};

/** State of repair, worst to best, mapped onto the unit interval. */
const CONDITION_SCORE: Readonly<Record<string, number>> = {
  NEEDS_REPAIR: 0,
  OLD_RENOVATION: 0.3,
  GOOD: 0.6,
  EURO_RENOVATION: 0.85,
  DESIGNER: 1,
};

/** A building older than this scores nothing on age alone. */
const MAX_MEANINGFUL_AGE_YEARS = 70;
const REFERENCE_YEAR = 2026;

export function clamp01(value: number): number {
  if (Number.isNaN(value)) {
    return 0;
  }
  return Math.min(1, Math.max(0, value));
}

export function haversineMetres(
  from: { lat: number; lon: number },
  to: { lat: number; lon: number },
): number {
  const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;
  const deltaLat = toRadians(to.lat - from.lat);
  const deltaLon = toRadians(to.lon - from.lon);
  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(toRadians(from.lat)) * Math.cos(toRadians(to.lat)) * Math.sin(deltaLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a));
}

/**
 * How far inside the budget the asking price sits.
 *
 * Linear rather than a curve, because a buyer reading "half your budget scores
 * 0.5" can verify it. A listing at exactly the budget scores zero on this
 * criterion but is not excluded: the other criteria may still carry it.
 */
export function priceScore(priceAmd: number, budgetAmd: number): number {
  if (budgetAmd <= 0) {
    return 0;
  }
  return clamp01(1 - priceAmd / budgetAmd);
}

/**
 * How the asking price compares with the model's own estimate.
 *
 * This is the criterion that makes the recommender more than a filter: it is the
 * only one that knows what a property of this kind is worth, rather than what
 * the buyer asked for. `deviationPct` is the listing's asking price against the
 * estimate, so a negative number is a bargain.
 */
export function valueScore(deviationPct: number | undefined): number | undefined {
  if (deviationPct === undefined) {
    return undefined;
  }
  const deviation = deviationPct / 100;
  return clamp01(0.5 - deviation / (2 * VALUE_BAND));
}

/**
 * Floor area against the smallest the buyer would accept.
 *
 * Saturating rather than linear: the difference between 50 m² and 70 m² matters
 * to someone who asked for 50, and the difference between 150 and 170 does not.
 * Full marks at twice the requested minimum.
 */
export function sizeScore(totalArea: number, areaMin: number | undefined): number {
  const floor = areaMin ?? 30;
  if (totalArea <= 0 || floor <= 0) {
    return 0;
  }
  return clamp01((totalArea / floor - 1) / 1);
}

/**
 * Room count against the requested range.
 *
 * Inside the range is full marks. Outside it the score falls by a third per
 * room, so a two-room flat still appears for someone who asked for three, lower
 * down, rather than vanishing.
 */
export function roomsScore(rooms: number, roomsMin: number, roomsMax: number | undefined): number {
  const upper = roomsMax ?? Number.POSITIVE_INFINITY;
  if (rooms >= roomsMin && rooms <= upper) {
    return 1;
  }
  const distance = rooms < roomsMin ? roomsMin - rooms : rooms - upper;
  return clamp01(1 - distance / 3);
}

/**
 * Closeness to what the buyer said matters.
 *
 * An anchor point wins when there is one, because a commute is a distance and
 * not a district. Otherwise a named district is full marks and anything else is
 * nothing. With neither, every listing scores the same and the criterion drops
 * out of the ranking on its own.
 */
export function locationScore(
  listing: { lat: number; lon: number; districtSlug: string },
  preferences: Pick<PreferenceProfile, 'anchor' | 'districts'>,
): number {
  if (preferences.anchor !== undefined) {
    const metres = haversineMetres(preferences.anchor, listing);
    return clamp01(1 - metres / LOCATION_HORIZON_M);
  }
  if (preferences.districts.length > 0) {
    return preferences.districts.includes(listing.districtSlug) ? 1 : 0;
  }
  return 0.5;
}

export function conditionScore(condition: string): number {
  return CONDITION_SCORE[condition] ?? 0.5;
}

/**
 * The building, as one number.
 *
 * Four facts a buyer would weigh together and could not rank separately without
 * being asked four more questions: what it is built of, how old it is, whether
 * there is a lift where one is needed, and whether it has been strengthened.
 * Yerevan sits on a seismic fault, which is why the last one is here at all.
 */
export function buildingScore(building: {
  buildingType: string;
  constructionYear: number;
  totalFloors: number;
  hasElevator: boolean;
  seismicRetrofit: boolean;
}): number {
  const type = BUILDING_TYPE_SCORE[building.buildingType] ?? 0.5;
  const age = clamp01(1 - (REFERENCE_YEAR - building.constructionYear) / MAX_MEANINGFUL_AGE_YEARS);
  // A lift only counts where its absence would be felt.
  const lift = building.totalFloors <= 4 || building.hasElevator ? 1 : 0;
  const seismic = building.seismicRetrofit ? 1 : 0;
  return clamp01(0.4 * type + 0.25 * age + 0.2 * lift + 0.15 * seismic);
}

/** Everything known about one candidate that the criteria need. */
export interface ScoringInput {
  row: ListingRow;
  /** From the valuation, when the model service could supply one. */
  deviationPct?: number | undefined;
}

/**
 * Scores one listing on every criterion.
 *
 * `value` is `undefined` rather than a default when no estimate was available,
 * so the caller can drop the criterion and redistribute its weight instead of
 * pretending the listing scored averagely on it.
 */
export function scoreCriteria(
  input: ScoringInput,
  preferences: PreferenceProfile,
): Record<RankingCriterion, number | undefined> {
  const { row } = input;
  return {
    price: priceScore(Number(String(row.price_amd)), preferences.budgetAmd),
    value: valueScore(input.deviationPct),
    size: sizeScore(toNumber(row.total_area), preferences.areaMin),
    rooms: roomsScore(row.rooms, preferences.roomsMin, preferences.roomsMax),
    location: locationScore({ lat: row.lat, lon: row.lon, districtSlug: row.d_slug }, preferences),
    condition: conditionScore(row.condition),
    building: buildingScore({
      buildingType: row.b_building_type,
      constructionYear: row.b_construction_year,
      totalFloors: row.b_total_floors,
      hasElevator: row.b_has_elevator,
      seismicRetrofit: row.b_seismic_retrofit,
    }),
  };
}
