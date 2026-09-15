/**
 * What happens to a paragraph between the model answering and a reader seeing it.
 *
 * The language model layer is stubbed rather than driven, because what is under
 * test here is not whether a model can be called — that is covered where the
 * layer lives — but whether a paragraph that quotes a figure nobody computed can
 * reach the response. It cannot, and these tests are the reason that is a fact
 * rather than an intention.
 */
import type { RankedExplanation } from '@smartestate/contracts';
import { describe, expect, it } from 'vitest';
import type {
  LlmService,
  StructuredRequest,
  StructuredResult,
} from '../../infrastructure/llm/llm.service.js';
import {
  describeSubjects,
  ExplanationsService,
  quotableFigures,
  systemPrompt,
  type ExplanationSubject,
} from './explanations.service.js';

const explanation: RankedExplanation = {
  highlights: [
    {
      criterion: 'price',
      kind: 'strength',
      score: 0.9,
      fact: { key: 'budgetHeadroomPct', value: 20.4 },
    },
    {
      criterion: 'value',
      kind: 'strength',
      score: 0.8,
      fact: { key: 'priceVsEstimatePct', value: -12.3 },
    },
    {
      criterion: 'building',
      kind: 'tradeoff',
      score: 0.2,
      fact: { key: 'buildingAgeYears', value: 51 },
    },
  ],
};

const subject = (overrides: Partial<ExplanationSubject> = {}): ExplanationSubject => ({
  listingId: 'listing-1',
  rank: 1,
  priceAmd: 45_000_000,
  areaSqm: 72,
  rooms: 3,
  explanation,
  ...overrides,
});

/**
 * An `LlmService` that answers with whatever the test wants, including nothing.
 *
 * `structured()` is the only method the explanations service uses, and its
 * contract is that it always returns a value, so a stub of it is a few lines.
 */
function stubLlm(answer: { explanations: { listingId: string; text: string }[] } | 'fallback'): {
  llm: LlmService;
  prompts: { system: string; user: string }[];
} {
  const prompts: { system: string; user: string }[] = [];
  const llm = {
    structured: <T>(request: StructuredRequest<T>): Promise<StructuredResult<T>> => {
      prompts.push({ system: request.system, user: request.user });
      const value = answer === 'fallback' ? request.fallback() : (answer as T);
      return Promise.resolve({
        value,
        source: answer === 'fallback' ? 'no-provider' : 'model',
        provider: 'ollama',
        model: 'test',
        trace: {
          task: 'explain-ranking',
          provider: 'ollama',
          model: 'test',
          source: answer === 'fallback' ? 'no-provider' : 'model',
          system: request.system,
          user: request.user,
          latencyMs: 1,
          at: new Date().toISOString(),
        },
      });
    },
  } as unknown as LlmService;
  return { llm, prompts };
}

describe('ExplanationsService', () => {
  it('keeps a paragraph that quotes only the figures it was given', async () => {
    const { llm } = stubLlm({
      explanations: [
        {
          listingId: 'listing-1',
          text: 'Ranked 1 because at 45,000,000 ֏ it is 20.4% under your budget and 12.3% below the estimate. The building is 51 years old.',
        },
      ],
    });

    const result = await new ExplanationsService(llm).phrase([subject()], 'en');

    expect(result.texts.get('listing-1')).toContain('20.4%');
    expect(result.source).toBe('model');
  });

  it('throws away a paragraph that invents a figure', async () => {
    const { llm } = stubLlm({
      explanations: [{ listingId: 'listing-1', text: 'A bargain at 38,000,000 ֏ for 72 m².' }],
    });

    const result = await new ExplanationsService(llm).phrase([subject()], 'en');

    // The call itself succeeded; this listing simply has no prose, and its
    // computed reasons still explain it.
    expect(result.texts.size).toBe(0);
    expect(result.source).toBe('model');
  });

  it('loses only the listing that was wrong, not the whole page', async () => {
    const { llm } = stubLlm({
      explanations: [
        { listingId: 'listing-1', text: '20.4% under budget, 3 rooms over 72 m².' },
        { listingId: 'listing-2', text: 'Nine metro stops away, 4 bathrooms.' },
      ],
    });

    const result = await new ExplanationsService(llm).phrase(
      [subject(), subject({ listingId: 'listing-2', rank: 2 })],
      'en',
    );

    expect([...result.texts.keys()]).toEqual(['listing-1']);
  });

  it('ignores a paragraph about a listing that is not on the page', async () => {
    const { llm } = stubLlm({
      explanations: [{ listingId: 'somewhere-else', text: 'A fine flat.' }],
    });

    const result = await new ExplanationsService(llm).phrase([subject()], 'en');

    expect(result.texts.size).toBe(0);
  });

  it('returns no prose at all when there is no model, and says so', async () => {
    const { llm } = stubLlm('fallback');

    const result = await new ExplanationsService(llm).phrase([subject()], 'en');

    expect(result.texts.size).toBe(0);
    expect(result.source).toBe('no-provider');
  });

  it('asks once for the whole page rather than once per listing', async () => {
    // The free tier allows about ten requests a minute. One call per result
    // would spend the minute on a single ranking.
    const { llm, prompts } = stubLlm({ explanations: [] });

    await new ExplanationsService(llm).phrase(
      Array.from({ length: 8 }, (_unused, index) =>
        subject({ listingId: `listing-${String(index)}`, rank: index + 1 }),
      ),
      'en',
    );

    expect(prompts).toHaveLength(1);
    expect(prompts[0]?.user).toContain('listing-7');
  });

  it('asks about the top results only, however long the page is', async () => {
    const { llm, prompts } = stubLlm({ explanations: [] });

    await new ExplanationsService(llm).phrase(
      Array.from({ length: 30 }, (_unused, index) =>
        subject({ listingId: `listing-${String(index)}`, rank: index + 1 }),
      ),
      'en',
    );

    expect(prompts[0]?.user).not.toContain('listing-20');
  });

  it('does not call the model when there is nothing to explain', async () => {
    const { llm, prompts } = stubLlm({ explanations: [] });

    const result = await new ExplanationsService(llm).phrase([], 'en');

    expect(prompts).toHaveLength(0);
    expect(result.source).toBe('disabled');
  });

  it('returns the trace, so the caller can store it beside the ranking', async () => {
    const { llm } = stubLlm({ explanations: [] });

    const result = await new ExplanationsService(llm).phrase([subject()], 'en');

    expect(result.trace?.task).toBe('explain-ranking');
    expect(result.trace?.system).toContain('English');
  });
});

describe('quotableFigures', () => {
  it('is exactly what the prompt hands over, and nothing derived from it', () => {
    // Price per square metre is arithmetic, and arithmetic is the thing a model
    // is not allowed to do here.
    expect(quotableFigures(subject())).toEqual([1, 45_000_000, 72, 3, 20.4, -12.3, 51]);
  });
});

describe('the prompt', () => {
  it('names the language the reader is using', () => {
    expect(systemPrompt('hy')).toContain('Armenian');
    expect(systemPrompt('ru')).toContain('Russian');
  });

  it('forbids inventing numbers and features', () => {
    const prompt = systemPrompt('en');

    expect(prompt).toContain('never calculate a new one');
    expect(prompt).toContain('Never mention a feature');
  });

  it('describes a listing as figures and reasons, never as a description', () => {
    const described = describeSubjects([subject()]);

    expect(described).toContain('listingId: listing-1');
    expect(described).toContain('45000000 AMD');
    expect(described).toContain('strength: price against budget (20.4% under the stated budget)');
    expect(described).toContain('tradeoff: the building itself (the building is 51 years old)');
  });

  it('phrases a price below the estimate as below it', () => {
    expect(describeSubjects([subject()])).toContain("12.3% below the model's estimate");
  });
});
