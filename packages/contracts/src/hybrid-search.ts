/**
 * Searching by sentence: filters, words and meaning, fused.
 *
 * One request carries the whole sentence. The server parses it into filters the
 * reader can see and correct, matches the words lexically, matches the meaning
 * semantically, and fuses the two rankings. The response says what each part
 * contributed, because a result the reader cannot account for is a result they
 * cannot disagree with.
 */
import { z } from 'zod';
import { answerSourceSchema } from './common/llm.js';
import { listingSummarySchema } from './listings.js';
import { parsedFiltersSchema } from './query-parsing.js';

/** The rankings that are fused. Named so a result can say which found it. */
export const SEARCH_ARMS = [
  /** PostgreSQL full-text search over the listing title and description. */
  'lexical',
  /** Nearest neighbours of the query vector among the listing embeddings. */
  'semantic',
] as const;
export const searchArmSchema = z.enum(SEARCH_ARMS);
export type SearchArm = z.infer<typeof searchArmSchema>;

/**
 * Why the semantic arm did not run, when it did not.
 *
 * Reported rather than hidden, because a hybrid search with one arm is a
 * different search and the difference is visible in the results. `not-indexed`
 * is the one an operator can fix, by running the backfill.
 */
export const SEMANTIC_SKIP_REASONS = [
  /** The model service could not be reached, or has no encoder loaded. */
  'unavailable',
  /** Nothing has been embedded yet. */
  'not-indexed',
] as const;
export const semanticSkipReasonSchema = z.enum(SEMANTIC_SKIP_REASONS);
export type SemanticSkipReason = z.infer<typeof semanticSkipReasonSchema>;

export const hybridSearchBodySchema = z.object({
  query: z.string().trim().min(1).max(300),
  /**
   * How many results to return. Deliberately small and uncursored: fusion
   * reorders a fixed pool from each arm, so there is no stable key to page by
   * and a second page would not mean what a second page usually means.
   */
  limit: z.number().int().min(1).max(50).default(20),
  /**
   * Filters to apply instead of the ones parsed from the sentence.
   *
   * Sent when the reader has corrected a chip: their edit is the intent, and
   * re-parsing the original sentence would quietly undo it.
   */
  filters: parsedFiltersSchema.optional(),
});
export type HybridSearchBody = z.infer<typeof hybridSearchBodySchema>;
export type HybridSearchBodyInput = z.input<typeof hybridSearchBodySchema>;

/** One result, with the account of how it got there. */
export const hybridSearchResultSchema = z.object({
  listing: listingSummarySchema,
  /** Position in the fused ranking, starting at 1. */
  rank: z.number().int().min(1),
  /** The reciprocal-rank-fusion score. Comparable within one response, not between two. */
  score: z.number(),
  /**
   * Where each arm placed this listing, 1-based. An arm that did not find it is
   * absent, which is the interesting case: it is how a reader can see that a
   * result was found by meaning and not by words.
   */
  ranks: z.partialRecord(searchArmSchema, z.number().int().min(1)),
});
export type HybridSearchResult = z.infer<typeof hybridSearchResultSchema>;

export const hybridSearchResponseSchema = z.object({
  /** What was typed, echoed back beside the chips. */
  query: z.string(),
  /** The filters that were applied, whether parsed or supplied. */
  filters: parsedFiltersSchema,
  /** Phrases the parser could not turn into a filter. The semantic arm is their answer. */
  unmapped: z.array(z.string()).max(10),
  /** How the filters were arrived at: `model`/`cache` mean a model read the sentence. */
  parseSource: answerSourceSchema,
  /** Which arms actually ran. One arm is a valid search and says so here. */
  arms: z.array(searchArmSchema),
  /** Present when the semantic arm was skipped, saying why. */
  semanticSkipped: semanticSkipReasonSchema.optional(),
  /** The fusion constant this ranking used, so a stored result stays interpretable. */
  rrfK: z.number().int().positive(),
  results: z.array(hybridSearchResultSchema),
});
export type HybridSearchResponse = z.infer<typeof hybridSearchResponseSchema>;
