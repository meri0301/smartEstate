/**
 * Preferences in, ranked listings out, with the arithmetic shown.
 *
 * The brief chooses a transparent multi-criteria model over an opaque one, and
 * the shapes here are what makes that choice real: every recommendation carries
 * the criteria it was scored on, the weight each one had, and what each
 * contributed. A reader can add the contributions up and get the score back.
 */
import { z } from 'zod';
import {
  amdAmountSchema,
  geoPointSchema,
  isoDateTimeSchema,
  uuidSchema,
} from './common/primitives.js';
import { answerSourceSchema } from './common/llm.js';
import { districtSlugSchema } from './geo.js';
import { listingSummarySchema } from './listings.js';

/**
 * The criteria a listing is judged on.
 *
 * Deliberately few, and each one something a buyer would recognise as a reason.
 * A criterion nobody can name is a criterion nobody can argue with, which is the
 * failure mode this design exists to avoid.
 */
export const RANKING_CRITERIA = [
  /** How far inside the stated budget the asking price is. */
  'price',
  /** How the asking price compares with the model's estimate for the property. */
  'value',
  /** Floor area against what was asked for. */
  'size',
  /** Room count against the requested range. */
  'rooms',
  /** Closeness to the places the buyer said matter. */
  'location',
  /** State of repair. */
  'condition',
  /** The building: type, age, lift, seismic work. */
  'building',
] as const;
export const rankingCriterionSchema = z.enum(RANKING_CRITERIA);
export type RankingCriterion = z.infer<typeof rankingCriterionSchema>;

export const RANKING_STRATEGIES = ['MCDA', 'LEARNED_BASELINE'] as const;
export const rankingStrategySchema = z.enum(RANKING_STRATEGIES);
export type RankingStrategy = z.infer<typeof rankingStrategySchema>;

/** How the criteria are combined once they are scored. Both are citable methods. */
export const MCDA_METHODS = ['WEIGHTED_SUM', 'TOPSIS'] as const;
export const mcdaMethodSchema = z.enum(MCDA_METHODS);
export type McdaMethod = z.infer<typeof mcdaMethodSchema>;

const weightSchema = z.number().min(0).max(1);

/**
 * What the buyer said matters, from the onboarding questions.
 *
 * Weights are relative, not absolute: they are normalised before use, so a
 * profile of all fives ranks exactly like a profile of all ones.
 */
export const preferenceWeightsSchema = z.object({
  price: weightSchema.default(1),
  value: weightSchema.default(1),
  size: weightSchema.default(0.6),
  rooms: weightSchema.default(0.8),
  location: weightSchema.default(0.8),
  condition: weightSchema.default(0.6),
  building: weightSchema.default(0.4),
});
export type PreferenceWeights = z.infer<typeof preferenceWeightsSchema>;

export const preferenceProfileSchema = z.object({
  /** The most the buyer is willing to pay. Listings above it are not shown. */
  budgetAmd: amdAmountSchema,
  roomsMin: z.number().int().min(1).max(10).default(1),
  roomsMax: z.number().int().min(1).max(10).optional(),
  /** Smallest floor area worth considering, in m². */
  areaMin: z.number().min(10).max(500).optional(),
  /** Districts the buyer named. Empty means anywhere. */
  districts: z.array(districtSlugSchema).max(20).default([]),
  /** Where the buyer commutes to, if they said. Distance to it scores `location`. */
  anchor: geoPointSchema.optional(),
  weights: preferenceWeightsSchema.default(() => preferenceWeightsSchema.parse({})),
});
export type PreferenceProfile = z.infer<typeof preferenceProfileSchema>;
export type PreferenceProfileInput = z.input<typeof preferenceProfileSchema>;

/** One criterion's part in one listing's score. */
export const criterionScoreSchema = z.object({
  criterion: rankingCriterionSchema,
  /** How well the listing does on it, from 0 to 1. */
  score: z.number().min(0).max(1),
  /** Its share of the total weight, after normalisation. */
  weight: z.number().min(0).max(1),
  /** score × weight: what it added to the total. */
  contribution: z.number(),
});
export type CriterionScore = z.infer<typeof criterionScoreSchema>;

/**
 * A figure a reason is about.
 *
 * Kept as a number with a named key rather than a formatted string, because the
 * reader's language decides how it is written and the reader's browser is
 * better at that than this server is. It also keeps the guardrail simple: every
 * number a user sees came from here, and this came from the database or the
 * model service.
 */
export const EXPLANATION_FACTS = [
  /** How far under the stated budget the asking price is, as a percentage. */
  'budgetHeadroomPct',
  /** Asking price against the model's estimate, as a percentage. Negative is a bargain. */
  'priceVsEstimatePct',
  /** Floor area, m². */
  'areaSqm',
  /** Room count. */
  'rooms',
  /** Metres from the buyer's anchor point. */
  'distanceM',
  /** Age of the building, in years. */
  'buildingAgeYears',
] as const;
export const explanationFactSchema = z.enum(EXPLANATION_FACTS);
export type ExplanationFact = z.infer<typeof explanationFactSchema>;

/**
 * One reason a listing is where it is.
 *
 * Computed, never generated. A strength is a criterion that pushed the listing
 * up; a trade-off is one it does badly on and the reader should know about
 * before they get attached to it. Showing only the strengths would make the
 * recommender an advertisement.
 */
export const explanationHighlightSchema = z.object({
  criterion: rankingCriterionSchema,
  kind: z.enum(['strength', 'tradeoff']),
  /** The criterion's score, 0–1. */
  score: z.number().min(0).max(1),
  /** The computed figure behind the reason, when the criterion has one. */
  fact: z.object({ key: explanationFactSchema, value: z.number() }).optional(),
});
export type ExplanationHighlight = z.infer<typeof explanationHighlightSchema>;

/**
 * Why one listing is where it is, in two layers.
 *
 * `highlights` is the explanation. It is computed from the breakdown, it is
 * always present, and a client can render a complete answer to "why this one?"
 * from it alone in any of the three languages.
 *
 * `text` is the same facts phrased as a paragraph by a language model, and is
 * absent whenever no model wrote one or the one it wrote failed the check that
 * every number in it was a number it was given. Prose is fluency, not
 * information: nothing is lost when it is missing.
 */
export const rankedExplanationSchema = z.object({
  highlights: z.array(explanationHighlightSchema).max(4),
  text: z.string().max(800).optional(),
});
export type RankedExplanation = z.infer<typeof rankedExplanationSchema>;

export const rankedListingSchema = z.object({
  listing: listingSummarySchema,
  /** Position in the result, starting at 1. */
  rank: z.number().int().min(1),
  /** The overall score, from 0 to 1. */
  score: z.number().min(0).max(1),
  /** Ordered by contribution, so the first entry is the strongest reason. */
  breakdown: z.array(criterionScoreSchema),
  explanation: rankedExplanationSchema,
});
export type RankedListing = z.infer<typeof rankedListingSchema>;

export const recommendationRequestSchema = z.object({
  preferences: preferenceProfileSchema,
  limit: z.number().int().min(1).max(50).default(10),
  strategy: rankingStrategySchema.default('MCDA'),
  method: mcdaMethodSchema.default('WEIGHTED_SUM'),
  /**
   * Whether to ask a language model to phrase the explanations.
   *
   * The computed highlights are returned either way; this only decides whether
   * prose is attempted on top of them. A caller that is batching, benchmarking
   * or running an experiment turns it off so the run costs no quota.
   */
  explain: z.boolean().default(true),
  /**
   * Groups a run with others in the same experiment, so two strategies can be
   * compared later on the same preferences.
   */
  experimentKey: z.string().min(1).max(64).optional(),
});
export type RecommendationRequest = z.infer<typeof recommendationRequestSchema>;
export type RecommendationRequestInput = z.input<typeof recommendationRequestSchema>;

export const recommendationResponseSchema = z.object({
  /** Identifies the stored session, so a click can be attributed to the ranking that produced it. */
  sessionId: uuidSchema,
  strategy: rankingStrategySchema,
  method: mcdaMethodSchema,
  /** How many listings passed the hard filters before ranking. */
  candidateCount: z.number().int().min(0),
  /**
   * Criteria that were dropped from this run, with their weight redistributed.
   * `value` drops out when the model service is unavailable, and saying so is
   * better than quietly ranking on something other than what was asked for.
   */
  omittedCriteria: z.array(rankingCriterionSchema),
  /**
   * How the prose was produced, for the whole run: one model call phrases every
   * listing on the page, because a free tier that allows ten requests a minute
   * cannot afford one call per result.
   */
  explanationSource: answerSourceSchema,
  items: z.array(rankedListingSchema),
  createdAt: isoDateTimeSchema,
});
export type RecommendationResponse = z.infer<typeof recommendationResponseSchema>;
