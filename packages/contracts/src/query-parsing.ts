/**
 * Turning what someone typed into filters they can see and correct.
 *
 * The output is deliberately not a search result. It is a set of filters plus an
 * account of how they were arrived at, because the brief's requirement is that
 * the reader is always shown what was understood and can change it. A parser
 * that silently applied its guesses would be worse than no parser at all: a
 * wrong filter that cannot be seen is indistinguishable from an empty market.
 */
import { z } from 'zod';
import { buildingTypeSchema, conditionSchema } from './common/enums.js';
import { ANSWER_SOURCES, answerSourceSchema, type AnswerSource } from './common/llm.js';
import { amdAmountSchema } from './common/primitives.js';
import { districtSlugSchema } from './geo.js';

/**
 * The filters a query may set.
 *
 * A strict subset of the search parameters: only the ones a sentence plausibly
 * expresses. Sorting, pagination and the map's bounding box are not things
 * anybody says out loud, and leaving them out means the parser cannot produce a
 * filter the reader did not ask for.
 */
export const parsedFiltersSchema = z.object({
  priceMin: amdAmountSchema.optional(),
  priceMax: amdAmountSchema.optional(),
  roomsMin: z.number().int().min(1).max(10).optional(),
  roomsMax: z.number().int().min(1).max(10).optional(),
  areaMin: z.number().min(10).max(500).optional(),
  areaMax: z.number().min(10).max(500).optional(),
  districts: z.array(districtSlugSchema).max(12).optional(),
  buildingTypes: z.array(buildingTypeSchema).max(6).optional(),
  conditions: z.array(conditionSchema).max(5).optional(),
  excludeGroundFloor: z.boolean().optional(),
  excludeTopFloor: z.boolean().optional(),
  hasElevator: z.boolean().optional(),
  hasParking: z.boolean().optional(),
});
export type ParsedFilters = z.infer<typeof parsedFiltersSchema>;

/** Every filter field a parse may produce, for the interface that renders them as chips. */
export const PARSED_FILTER_FIELDS = [
  'priceMin',
  'priceMax',
  'roomsMin',
  'roomsMax',
  'areaMin',
  'areaMax',
  'districts',
  'buildingTypes',
  'conditions',
  'excludeGroundFloor',
  'excludeTopFloor',
  'hasElevator',
  'hasParking',
] as const;
export type ParsedFilterField = (typeof PARSED_FILTER_FIELDS)[number];

/**
 * Where the parse came from.
 *
 * The shared list, not a copy of it: a parse is an answer a model could have
 * produced, and it reports the same seven outcomes as every other such answer.
 * Anything other than `model` or `cache` means the deterministic parser
 * answered, and says why.
 */
export const PARSE_SOURCES = ANSWER_SOURCES;
export const parseSourceSchema = answerSourceSchema;
export type ParseSource = AnswerSource;

export const parseQueryBodySchema = z.object({
  query: z.string().trim().min(1).max(300),
});
export type ParseQueryBody = z.infer<typeof parseQueryBodySchema>;

export const parsedQuerySchema = z.object({
  /** What was typed, echoed back so the client can show it beside the chips. */
  query: z.string(),
  filters: parsedFiltersSchema,
  /**
   * Words the parser could not turn into a filter.
   *
   * Reported rather than swallowed: "quiet" and "near a school" are reasonable
   * things to ask for and the system cannot yet act on either, so it says so
   * instead of quietly returning results that ignore them.
   */
  unmapped: z.array(z.string()).max(10),
  source: parseSourceSchema,
});
export type ParsedQuery = z.infer<typeof parsedQuerySchema>;
