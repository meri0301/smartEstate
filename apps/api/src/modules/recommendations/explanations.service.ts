/**
 * Asking a language model to phrase the computed reasons, and checking it did.
 *
 * Three decisions carry this file.
 *
 * One call per page, not one per listing. The free tier allows roughly ten
 * requests a minute, and a page of ten results would spend the whole minute on a
 * single ranking. The model is given every listing on the page at once and
 * answers for all of them.
 *
 * The model is given facts, never the listing. It sees a rank, a price, an area,
 * a room count and the criteria that decided the position — not the description,
 * the address or the photographs. There is nothing in the prompt to embellish.
 *
 * Every paragraph is checked before it is used. Any number in it that cannot be
 * traced back to a figure it was given means the paragraph is dropped and the
 * computed reasons stand alone. That check is per listing: a model that
 * hallucinates on the fourth result does not cost the other nine their prose.
 */
import { Injectable, Logger } from '@nestjs/common';
import {
  type AnswerSource,
  type ExplanationFact,
  type Locale,
  type RankedExplanation,
  type RankingCriterion,
} from '@smartestate/contracts';
import { z } from 'zod';
import { LlmService } from '../../infrastructure/llm/llm.service.js';
import type { LlmTrace } from '../../infrastructure/llm/llm.service.js';
import { ungroundedNumbers } from './grounding.js';

/** Bumped when the meaning of the prompt changes, to retire cached paragraphs. */
const SCHEMA_VERSION = 1;

/**
 * How many results get prose.
 *
 * Everything on the page keeps its computed reasons; only the top few are worth
 * spending output tokens on, because nobody reads a paragraph about the
 * thirty-first result. It also bounds the prompt, which a `limit` of 50 would
 * otherwise let grow without a ceiling.
 */
const MAX_PROSE_ITEMS = 10;

/** Enough for ten short paragraphs in Armenian, which is the longest of the three. */
const MAX_OUTPUT_TOKENS = 1_400;

/** Low, but not zero: this is the one task in the system where wording is the point. */
const TEMPERATURE = 0.3;

const modelAnswerSchema = z.object({
  explanations: z
    .array(z.object({ listingId: z.string().min(1), text: z.string().min(1).max(800) }))
    .max(MAX_PROSE_ITEMS),
});

/**
 * The outcomes in which a model was actually contacted.
 *
 * Worth distinguishing because a trace is only evidence when there was a call to
 * be evidence of. `invalid` and `error` are in here deliberately: a model that
 * answered unusably is exactly the case somebody will want to read back.
 */
const CONTACTED: ReadonlySet<AnswerSource> = new Set<AnswerSource>([
  'model',
  'cache',
  'invalid',
  'error',
]);

/** Whether this run has a trace worth keeping beside the ranking. */
export function wasModelContacted(source: AnswerSource): boolean {
  return CONTACTED.has(source);
}

/** What the model is told about one listing, and the figures it may quote about it. */
export interface ExplanationSubject {
  listingId: string;
  rank: number;
  priceAmd: number;
  areaSqm: number;
  rooms: number;
  explanation: RankedExplanation;
}

export interface PhrasedExplanations {
  /** Listing id to the paragraph that survived the check. */
  texts: Map<string, string>;
  source: AnswerSource;
  trace: LlmTrace | undefined;
}

@Injectable()
export class ExplanationsService {
  private readonly logger = new Logger(ExplanationsService.name);

  constructor(private readonly llm: LlmService) {}

  /**
   * One paragraph per listing, in the reader's language, or none at all.
   *
   * The fallback is an empty set of paragraphs, which is a complete answer: the
   * caller already holds the computed reasons, and a client renders those in any
   * of the three languages without help. Prose is fluency, not information.
   */
  async phrase(
    subjects: readonly ExplanationSubject[],
    locale: Locale,
  ): Promise<PhrasedExplanations> {
    const wanted = subjects.slice(0, MAX_PROSE_ITEMS);
    if (wanted.length === 0) {
      return { texts: new Map(), source: 'disabled', trace: undefined };
    }

    const answer = await this.llm.structured({
      task: 'explain-ranking',
      system: systemPrompt(locale),
      user: describeSubjects(wanted),
      schema: modelAnswerSchema,
      schemaVersion: SCHEMA_VERSION,
      fallback: () => ({ explanations: [] }),
      temperature: TEMPERATURE,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
    });

    return {
      texts: this.accept(answer.value.explanations, wanted),
      source: answer.source,
      trace: answer.trace,
    };
  }

  /**
   * Keeps the paragraphs that are about a listing on this page and quote only
   * figures they were given.
   *
   * A paragraph attached to an unknown id is dropped without comment: the model
   * has answered about something that is not in front of the reader, and there
   * is no charitable reading of that worth acting on.
   */
  private accept(
    answers: readonly { listingId: string; text: string }[],
    subjects: readonly ExplanationSubject[],
  ): Map<string, string> {
    const byId = new Map(subjects.map((subject) => [subject.listingId, subject]));
    const accepted = new Map<string, string>();

    for (const answer of answers) {
      const subject = byId.get(answer.listingId);
      if (subject === undefined) {
        this.logger.warn('discarding a paragraph about a listing that is not on this page');
        continue;
      }
      const ungrounded = ungroundedNumbers(answer.text, quotableFigures(subject));
      if (ungrounded.length > 0) {
        this.logger.warn(
          { listingId: subject.listingId, ungrounded },
          'discarding a paragraph that quotes figures it was not given',
        );
        continue;
      }
      accepted.set(subject.listingId, answer.text.trim());
    }
    return accepted;
  }
}

/**
 * Every number the model may write about one listing.
 *
 * Exactly the figures the prompt hands over, and nothing derived from them: if a
 * paragraph wants to say the price per square metre, it would have to do
 * arithmetic, and arithmetic is the thing this system does not let a model do.
 */
export function quotableFigures(subject: ExplanationSubject): number[] {
  const figures = [subject.rank, subject.priceAmd, subject.areaSqm, subject.rooms];
  for (const highlight of subject.explanation.highlights) {
    if (highlight.fact !== undefined) {
      figures.push(highlight.fact.value);
    }
  }
  return figures;
}

/** How each computed figure is described to the model. English: it is a prompt, not a screen. */
const FACT_PHRASES: Readonly<Record<ExplanationFact, (value: number) => string>> = {
  budgetHeadroomPct: (value) =>
    value >= 0
      ? `${String(value)}% under the stated budget`
      : `${String(Math.abs(value))}% over the stated budget`,
  priceVsEstimatePct: (value) =>
    value <= 0
      ? `asking ${String(Math.abs(value))}% below the model's estimate for this property`
      : `asking ${String(value)}% above the model's estimate for this property`,
  areaSqm: (value) => `${String(value)} m² of floor area`,
  rooms: (value) => `${String(value)} rooms`,
  distanceM: (value) => `${String(value)} m from the place the buyer named`,
  buildingAgeYears: (value) => `the building is ${String(value)} years old`,
};

/** What each criterion is, in words the model can use without being told the curve. */
const CRITERION_PHRASES: Readonly<Record<RankingCriterion, string>> = {
  price: 'price against budget',
  value: 'price against the estimated market value',
  size: 'floor area',
  rooms: 'room count',
  location: 'location',
  condition: 'state of repair',
  building: 'the building itself',
};

const LANGUAGE_NAMES: Readonly<Record<Locale, string>> = {
  hy: 'Armenian',
  ru: 'Russian',
  en: 'English',
};

/**
 * What the model is allowed to do.
 *
 * Narrow on purpose, and negative where it matters. The rules that forbid
 * inventing numbers and inventing features are the ones the grounding check
 * enforces afterwards; stating them here as well is not redundancy, it is the
 * difference between a model that mostly complies and one that has to be
 * corrected on every answer.
 */
export function systemPrompt(locale: Locale): string {
  return [
    'You write one short paragraph per property listing, explaining to a buyer why',
    'it was ranked where it was. The ranking has already been computed; you are',
    'phrasing its reasons, not producing them.',
    '',
    `Write in ${LANGUAGE_NAMES[locale]}.`,
    '',
    'Answer with JSON only, in this shape:',
    '{"explanations":[{"listingId":"...","text":"..."}]}',
    '',
    'Rules:',
    '  Use only the figures given for that listing. Never write a number that is',
    '  not in its list, and never calculate a new one from them.',
    '  Never mention a feature, district, street or amenity that is not given.',
    '  State the trade-offs as plainly as the strengths. This is advice, not an',
    '  advertisement, and a buyer who is surprised later was misled now.',
    '  Two or three sentences per listing. Plain prose: no lists, no headings,',
    '  no markdown, no emoji.',
    '  Use the listingId exactly as given. Answer for every listing, once each.',
  ].join('\n');
}

/** The page, as facts. */
export function describeSubjects(subjects: readonly ExplanationSubject[]): string {
  return subjects
    .map((subject) => {
      const lines = [
        `listingId: ${subject.listingId}`,
        `  rank: ${String(subject.rank)}`,
        `  price: ${String(subject.priceAmd)} AMD`,
        `  area: ${String(subject.areaSqm)} m2`,
        `  rooms: ${String(subject.rooms)}`,
      ];
      if (subject.explanation.highlights.length > 0) {
        lines.push('  reasons:');
        for (const highlight of subject.explanation.highlights) {
          const detail =
            highlight.fact === undefined
              ? ''
              : ` (${FACT_PHRASES[highlight.fact.key](highlight.fact.value)})`;
          lines.push(`    ${highlight.kind}: ${CRITERION_PHRASES[highlight.criterion]}${detail}`);
        }
      }
      return lines.join('\n');
    })
    .join('\n\n');
}
