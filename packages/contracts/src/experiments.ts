/**
 * A/B experiments over ranking strategies, and the outcomes that decide them.
 *
 * The recommender logs every run and the interface records what people do with
 * the results. This contract is the bridge between those two streams and the
 * evaluation chapter: which arm a session was served under, what the reader did
 * about it, and the per-arm metrics that follow — with the sample size beside
 * every number, because a difference measured on eleven sessions is a story and
 * not a finding.
 */
import { z } from 'zod';
import { isoDateTimeSchema, uuidSchema } from './common/primitives.js';
import { interactionTypeSchema } from './common/enums.js';
import { mcdaMethodSchema, rankingStrategySchema } from './recommendations.js';

/**
 * One arm: a name, and the strategy and method it maps to.
 *
 * The harness knows nothing about what an arm *does*; it knows how to assign to
 * one, record exposures under it and compare outcomes between them. A learned
 * ranker, when there is one, is another entry with a different strategy and no
 * change here.
 */
export const experimentArmSchema = z.object({
  name: z.string().min(1).max(32),
  strategy: rankingStrategySchema,
  method: mcdaMethodSchema,
  /** Relative share of traffic. Normalised across the arms, so 1 and 1 is 50/50. */
  weight: z.number().positive(),
});
export type ExperimentArm = z.infer<typeof experimentArmSchema>;

export const experimentSchema = z.object({
  key: z.string().min(1).max(64),
  name: z.string(),
  description: z.string(),
  arms: z.array(experimentArmSchema).min(2),
  isActive: z.boolean(),
  createdAt: isoDateTimeSchema,
});
export type Experiment = z.infer<typeof experimentSchema>;

/** Recording what a reader did with a listing they were shown. */
export const recordInteractionBodySchema = z.object({
  listingId: uuidSchema,
  type: interactionTypeSchema,
  /**
   * The recommendation session the listing was shown in, when it was one.
   * This is the join that turns a click into an outcome for an arm; without it
   * the interaction is still useful for the listing, and useless for the
   * experiment.
   */
  sessionId: uuidSchema.optional(),
  /** Type-specific magnitude, e.g. dwell time in milliseconds. */
  value: z.number().int().min(0).optional(),
});
export type RecordInteractionBody = z.infer<typeof recordInteractionBodySchema>;

export const interactionRecordedSchema = z.object({
  id: uuidSchema,
  recordedAt: isoDateTimeSchema,
});
export type InteractionRecorded = z.infer<typeof interactionRecordedSchema>;

/**
 * A mean with what is needed to judge it: how many it was over, and how far it
 * might be off.
 */
export const metricEstimateSchema = z.object({
  mean: z.number(),
  /** Standard error of the mean. Zero when n is 1, undefined when n is 0. */
  standardError: z.number().optional(),
  n: z.number().int().min(0),
});
export type MetricEstimate = z.infer<typeof metricEstimateSchema>;

/** Everything measured for one arm. */
export const armResultsSchema = z.object({
  arm: experimentArmSchema,
  /** Sessions served under this arm. */
  sessions: z.number().int().min(0),
  /** Sessions with at least one interaction on a shown listing. */
  sessionsWithFeedback: z.number().int().min(0),
  /** Share of sessions in which something shown was acted on. */
  clickThroughRate: metricEstimateSchema,
  /** Over sessions with feedback: share of the top k that were acted on. */
  precisionAtK: metricEstimateSchema,
  /** Over sessions with feedback: graded relevance of the shown order against the ideal. */
  ndcgAtK: metricEstimateSchema,
});
export type ArmResults = z.infer<typeof armResultsSchema>;

/**
 * The difference between two arms on one metric, with an interval.
 *
 * Welch's t interval on the difference of means, at 95%. Reported as an
 * interval rather than a p-value because an interval says how large the effect
 * might be, which is what a decision needs, and a p-value only says whether it
 * might be zero.
 */
export const armComparisonSchema = z.object({
  metric: z.enum(['clickThroughRate', 'precisionAtK', 'ndcgAtK']),
  /** The two arm names, in the order the difference is taken: first minus second. */
  arms: z.tuple([z.string(), z.string()]),
  difference: z.number(),
  confidenceLow: z.number(),
  confidenceHigh: z.number(),
  /** True when the interval excludes zero. */
  distinguishable: z.boolean(),
});
export type ArmComparison = z.infer<typeof armComparisonSchema>;

export const experimentResultsSchema = z.object({
  experiment: experimentSchema,
  /** The k the ranking metrics were computed at. */
  k: z.number().int().min(1),
  /** How relevance was read from interactions: type to gain. */
  relevanceGains: z.record(interactionTypeSchema, z.number().min(0)),
  /**
   * Below this many sessions per arm, nothing here should be called a result.
   * The threshold is published so the page can say so instead of implying a
   * winner from noise.
   */
  minimumSessionsPerArm: z.number().int().min(1),
  arms: z.array(armResultsSchema),
  /** Pairwise, first arm against each other arm. Empty below the minimum. */
  comparisons: z.array(armComparisonSchema),
  /** Whether every arm has reached the minimum. */
  sufficient: z.boolean(),
  computedAt: isoDateTimeSchema,
});
export type ExperimentResults = z.infer<typeof experimentResultsSchema>;
