/**
 * Better options for the listing somebody is looking at.
 *
 * The question this answers is narrower and more useful than "what else is
 * there": given this flat, is there one that is simply better, and if not, what
 * exactly would you be trading away? A buyer can act on that. A longer list of
 * vaguely similar properties is what every other site already gives them.
 *
 * Every alternative carries the comparison that produced it — the value of each
 * criterion on both sides, and which way each one went — so the claim "this one
 * is better" can be checked rather than believed.
 */
import { z } from 'zod';
import { queryIntSchema, queryNumberSchema } from './common/query.js';
import { listingSummarySchema } from './listings.js';

/**
 * The criteria two listings are compared on.
 *
 * Deliberately not the same list as the recommender's. That one scores a listing
 * against what a buyer said they wanted; this one compares two listings against
 * each other, so it holds only properties with an unarguable direction.
 *
 * Rooms and district are absent on purpose. More rooms is not better — a
 * one-room buyer does not want four — and neither is a different district, which
 * is a matter of taste and not of quality. Both are used to choose which
 * listings are comparable at all, which is a different job.
 */
export const COMPARISON_CRITERIA = [
  /** Asking price. Lower is better. */
  'price',
  /** Floor area in m². Larger is better. */
  'area',
  /** State of repair. Better is better. */
  'condition',
  /** The building: type, age, lift where one is needed, seismic work. */
  'building',
  /** Whether the floor is one people avoid: the ground, or the top with no lift. */
  'floor',
  /** Distance to the place the buyer named. Only compared when they named one. */
  'location',
  /** Asking price against the model's estimate. Only compared when the model answered. */
  'value',
] as const;
export const comparisonCriterionSchema = z.enum(COMPARISON_CRITERIA);
export type ComparisonCriterion = z.infer<typeof comparisonCriterionSchema>;

/**
 * How one alternative stands against the listing being viewed.
 *
 * `DOMINATES` is Pareto dominance: at least as good on every criterion compared
 * and better on at least one. It is the strong claim, and it is rare, which is
 * what makes it worth making.
 */
export const DOMINANCE_RELATIONS = [
  /** Better on something, worse on nothing. */
  'DOMINATES',
  /** Better on something, worse on something else. */
  'TRADE_OFF',
  /** Indistinguishable on every criterion compared. */
  'EQUIVALENT',
] as const;
export const dominanceRelationSchema = z.enum(DOMINANCE_RELATIONS);
export type DominanceRelation = z.infer<typeof dominanceRelationSchema>;

/** Which way one criterion went, and by how much. */
export const criterionComparisonSchema = z.object({
  criterion: comparisonCriterionSchema,
  /**
   * `better`, `worse`, or `same`. `same` covers a difference too small to be a
   * reason to prefer one listing over the other, not only exact equality.
   */
  direction: z.enum(['better', 'worse', 'same']),
  /** The criterion's value for the listing being viewed, in its own unit. */
  subject: z.number(),
  /** The same, for the alternative. */
  alternative: z.number(),
  /**
   * The unit the two values are in, so a client can format them without a table
   * of its own: `amd`, `sqm`, `metres`, `years`, or `score` for the 0–1 scales.
   */
  unit: z.enum(['amd', 'sqm', 'metres', 'years', 'percent', 'score']),
});
export type CriterionComparison = z.infer<typeof criterionComparisonSchema>;

export const alternativeListingSchema = z.object({
  listing: listingSummarySchema,
  relation: dominanceRelationSchema,
  /** Every criterion compared, in a stable order: gains first, then losses, then ties. */
  comparisons: z.array(criterionComparisonSchema),
  /**
   * How many criteria this alternative is better on, and worse on.
   *
   * Duplicated from `comparisons` because it is what the ordering is by, and a
   * client showing "better on 3, worse on 1" should not have to recount.
   */
  betterCount: z.number().int().min(0),
  worseCount: z.number().int().min(0),
});
export type AlternativeListing = z.infer<typeof alternativeListingSchema>;

/**
 * A query string, so every value arrives as text and is coerced.
 *
 * The anchor is two flat parameters rather than a nested object, because a
 * query string has no nesting and inventing a bracket convention for one
 * endpoint would be a private dialect nobody else in the API speaks. They are
 * refined together: half an anchor is a mistake worth reporting, not a reason
 * to silently drop the location criterion.
 */
export const alternativesQuerySchema = z
  .object({
    /** How many alternatives to return. */
    limit: queryIntSchema.min(1).max(12).default(6),
    /** Latitude of the place the buyer named. */
    anchorLat: queryNumberSchema.min(-90).max(90).optional(),
    /** Longitude of the same. */
    anchorLon: queryNumberSchema.min(-180).max(180).optional(),
  })
  .refine((query) => (query.anchorLat === undefined) === (query.anchorLon === undefined), {
    message: 'anchorLat and anchorLon must be given together',
    path: ['anchorLat'],
  });
export type AlternativesQuery = z.infer<typeof alternativesQuerySchema>;
export type AlternativesQueryInput = z.input<typeof alternativesQuerySchema>;

export const alternativesResponseSchema = z.object({
  /** The listing being compared against, so the page can render one table. */
  subject: listingSummarySchema,
  /** Criteria that were compared for every alternative. */
  criteria: z.array(comparisonCriterionSchema),
  /**
   * Criteria that could not be compared, and are therefore absent from every
   * comparison. `location` without an anchor, `value` without the model service.
   * Said out loud because a dominance claim made on five criteria is a weaker
   * claim than the same one made on seven.
   */
  omittedCriteria: z.array(comparisonCriterionSchema),
  /** How many listings were examined before these were chosen. */
  candidateCount: z.number().int().min(0),
  /** Dominant options first, then trade-offs. Never anything strictly worse. */
  alternatives: z.array(alternativeListingSchema),
});
export type AlternativesResponse = z.infer<typeof alternativesResponseSchema>;
