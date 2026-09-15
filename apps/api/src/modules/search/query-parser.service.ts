/**
 * Free text to filters, deterministically first.
 *
 * The rule-based parser runs on every request, whether or not a model is
 * configured, because it is the fallback the language model layer requires and
 * because its result is what the reader sees when the model is unavailable.
 * With `LLM_PROVIDER=rule-based` it is the whole feature.
 *
 * When a model is available it is asked the same question and its answer is
 * validated against the same schema. It wins on disagreement, because a model
 * reads a sentence better than a keyword list; but it is never given the chance
 * to invent a filter outside the schema, and anything it returns that does not
 * validate is discarded in favour of the rules.
 */
import { Injectable, Logger } from '@nestjs/common';
import { parsedFiltersSchema, type Locale, type ParsedQuery } from '@smartestate/contracts';
import { z } from 'zod';
import { LlmService } from '../../infrastructure/llm/llm.service.js';
import { GeoService } from '../geo/geo.service.js';
import { parseWithRules, type DistrictVocabulary } from './rule-based-parser.js';

/** The model is asked for the filters and for what it could not place. */
const modelAnswerSchema = z.object({
  filters: parsedFiltersSchema,
  unmapped: z.array(z.string()).max(10).default([]),
});

/** Bumped when the filter schema changes meaning, to retire cached answers. */
const SCHEMA_VERSION = 1;

/** Districts change only when the database is reseeded. */
const VOCABULARY_TTL_MS = 10 * 60 * 1000;

@Injectable()
export class QueryParserService {
  private readonly logger = new Logger(QueryParserService.name);
  private vocabulary: { value: DistrictVocabulary[]; expiresAt: number } | undefined;

  constructor(
    private readonly geo: GeoService,
    private readonly llm: LlmService,
  ) {}

  async parse(query: string, locale: Locale): Promise<ParsedQuery> {
    const districts = await this.districtVocabulary();
    const rules = parseWithRules(query, districts);

    const answer = await this.llm.structured({
      task: 'parse-query',
      system: systemPrompt(districts, locale),
      user: query,
      schema: modelAnswerSchema,
      schemaVersion: SCHEMA_VERSION,
      // Deterministic, already computed, and costs nothing to hand over.
      fallback: () => ({ filters: rules.filters, unmapped: rules.unmapped }),
      // A parse is an extraction, not a composition: the same sentence should
      // always produce the same filters.
      temperature: 0,
      maxOutputTokens: 400,
    });

    return {
      query,
      filters: answer.value.filters,
      unmapped: answer.value.unmapped,
      source: answer.source,
    };
  }

  /**
   * Every spelling of every district, in all three languages.
   *
   * Read from the database rather than a constant so a newly seeded district is
   * searchable immediately, and cached because it changes about as often as the
   * city does.
   */
  private async districtVocabulary(): Promise<DistrictVocabulary[]> {
    const now = Date.now();
    if (this.vocabulary !== undefined && this.vocabulary.expiresAt > now) {
      return this.vocabulary.value;
    }
    const districts = await this.geo.listDistricts();
    const value = districts.map((district) => ({
      slug: district.slug,
      names: [
        district.name.hy,
        district.name.ru,
        district.name.en,
        district.slug.replace('-', ' '),
      ],
    }));
    this.vocabulary = { value, expiresAt: now + VOCABULARY_TTL_MS };
    this.logger.log(`district vocabulary refreshed: ${String(value.length)} districts`);
    return value;
  }
}

/**
 * What the model is allowed to do.
 *
 * The prompt is deliberately narrow. It hands over the district vocabulary so
 * the model cannot invent a slug, forbids inference about anything not said, and
 * asks for the unmatched phrases back. It never asks the model to judge, rank or
 * price anything: those are the system's job, and a sentence is the only thing
 * here a model reads better than a keyword list.
 */
export function systemPrompt(districts: readonly DistrictVocabulary[], locale: Locale): string {
  const slugs = districts.map((district) => `${district.slug} (${district.names.join(', ')})`);
  return [
    'You convert a property search written in Armenian, Russian or English into a JSON filter.',
    '',
    'Answer with JSON only, in this shape:',
    '{"filters":{...},"unmapped":["..."]}',
    '',
    'Allowed filter keys, all optional:',
    '  priceMin, priceMax      whole dram, e.g. "60 million" is 60000000',
    '  roomsMin, roomsMax      integers 1-10; an exact count sets both',
    '  areaMin, areaMax        square metres, 10-500',
    '  districts               an array of the slugs listed below, nothing else',
    '  buildingTypes           STONE, PANEL, MONOLITH, KHRUSHCHYOVKA, STALINKA, NEW_BUILD',
    '  conditions              NEEDS_REPAIR, OLD_RENOVATION, GOOD, EURO_RENOVATION, DESIGNER',
    '  excludeGroundFloor      true only if the writer rules the ground floor out',
    '  excludeTopFloor         true only if the writer rules the top floor out',
    '  hasElevator, hasParking true or false, only if stated',
    '',
    'Districts:',
    ...slugs.map((line) => `  ${line}`),
    '',
    'Rules:',
    '  Include a key only if the text says so. Do not infer, guess or round.',
    '  Never invent a district slug that is not in the list above.',
    '  Put every phrase you could not turn into a filter into "unmapped", in the',
    '  writer’s own words. Phrases like "quiet" or "near a school" belong there.',
    `  The writer is using the ${locale} interface, but may type in any language.`,
  ].join('\n');
}
