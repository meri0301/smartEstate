/**
 * Ranking against the real catalogue, with a stub standing in for the model.
 *
 * The substantive checks here are the ones a thesis has to defend: that the hard
 * limits are respected, that changing the weights changes the answer, that the
 * published breakdown reconstructs the published score, and that every run is
 * recorded well enough to compare strategies afterwards.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type {
  PreferenceProfileInput,
  RecommendationRequestInput,
  RecommendationResponse,
} from '@smartestate/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startTestApp, type TestApp } from './setup/test-app.js';

const BUDGET = 60_000_000;

const stub = { available: true };

/** Answers `/predict` for any batch, pricing every listing a little under its asking price. */
function startStub(): Promise<{ server: Server; baseUrl: string }> {
  const server = createServer((request, response) => {
    if (!stub.available) {
      response.writeHead(503, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ detail: 'No valuation model is loaded.' }));
      return;
    }
    if (request.url === '/model') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(
        JSON.stringify({
          modelVersion: 'valuation-lgbm-test-00000000',
          trainedAt: '2026-09-14T00:00:00+00:00',
          trainingRows: 300,
        }),
      );
      return;
    }
    let body = '';
    request.on('data', (chunk: Buffer) => (body += chunk.toString()));
    request.on('end', () => {
      const parsed = JSON.parse(body) as { listings: { totalArea: number }[] };
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(
        JSON.stringify({
          modelVersion: 'valuation-lgbm-test-00000000',
          estimates: parsed.listings.map((listing) => {
            const pricePerSqmAmd = 700_000;
            const priceAmd = pricePerSqmAmd * listing.totalArea;
            return {
              pricePerSqmAmd,
              priceAmd,
              lowPriceAmd: priceAmd * 0.8,
              highPriceAmd: priceAmd * 1.2,
            };
          }),
        }),
      );
    });
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({ server, baseUrl: `http://127.0.0.1:${String(port)}` });
    });
  });
}

const preferences = (overrides: Partial<PreferenceProfileInput> = {}): PreferenceProfileInput => ({
  budgetAmd: BUDGET,
  roomsMin: 2,
  roomsMax: 3,
  ...overrides,
});

describe('recommendations', () => {
  let app: TestApp;
  let server: Server;

  const recommend = async (body: RecommendationRequestInput): Promise<RecommendationResponse> => {
    const response = await app.request('POST', '/api/recommendations?locale=en', { body });
    expect(response.statusCode).toBe(200);
    return response.json<RecommendationResponse>();
  };

  beforeAll(async () => {
    const started = await startStub();
    server = started.server;
    app = await startTestApp({ ML_BASE_URL: started.baseUrl });
  });

  afterAll(async () => {
    await app.close();
    await new Promise<void>((resolve) => {
      server.close(() => {
        resolve();
      });
    });
  });

  it('returns listings ranked best first', async () => {
    const result = await recommend({ preferences: preferences(), limit: 5 });

    expect(result.items).toHaveLength(5);
    expect(result.candidateCount).toBeGreaterThan(5);
    expect(result.items.map((item) => item.rank)).toEqual([1, 2, 3, 4, 5]);
    const scores = result.items.map((item) => item.score);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
  });

  it('treats the buyer’s limits as filters, not preferences', async () => {
    const result = await recommend({ preferences: preferences(), limit: 20 });

    for (const item of result.items) {
      expect(item.listing.priceAmd).toBeLessThanOrEqual(BUDGET);
      expect(item.listing.rooms).toBeGreaterThanOrEqual(2);
      expect(item.listing.rooms).toBeLessThanOrEqual(3);
    }
  });

  it('publishes a breakdown that reconstructs the score', async () => {
    const result = await recommend({
      preferences: preferences(),
      limit: 3,
      method: 'WEIGHTED_SUM',
    });

    for (const item of result.items) {
      const total = item.breakdown.reduce((sum, entry) => sum + entry.contribution, 0);
      expect(total).toBeCloseTo(item.score, 3);
      const weights = item.breakdown.reduce((sum, entry) => sum + entry.weight, 0);
      expect(weights).toBeCloseTo(1, 3);
    }
  });

  it('orders the breakdown so the first entry is the strongest reason', async () => {
    const result = await recommend({ preferences: preferences(), limit: 1 });
    const breakdown = result.items[0]?.breakdown ?? [];

    const contributions = breakdown.map((entry) => entry.contribution);
    expect([...contributions].sort((a, b) => b - a)).toEqual(contributions);
  });

  it('changes its answer when the buyer changes their priorities', async () => {
    const onPrice = await recommend({
      preferences: preferences({
        weights: { price: 1, value: 0, size: 0, rooms: 0, location: 0, condition: 0, building: 0 },
      }),
      limit: 5,
    });
    const onSize = await recommend({
      preferences: preferences({
        weights: { price: 0, value: 0, size: 1, rooms: 0, location: 0, condition: 0, building: 0 },
      }),
      limit: 5,
    });

    // Cheapest first against largest first: the same catalogue, different answers.
    expect(onPrice.items[0]?.listing.id).not.toBe(onSize.items[0]?.listing.id);
    expect(onPrice.items[0]?.listing.priceAmd).toBeLessThan(onSize.items[0]?.listing.priceAmd ?? 0);
    expect(onSize.items[0]?.listing.totalArea).toBeGreaterThan(
      onPrice.items[0]?.listing.totalArea ?? 0,
    );
  });

  it('ranks the same catalogue by either method', async () => {
    const sum = await recommend({ preferences: preferences(), limit: 10, method: 'WEIGHTED_SUM' });
    const topsis = await recommend({ preferences: preferences(), limit: 10, method: 'TOPSIS' });

    expect(topsis.method).toBe('TOPSIS');
    expect(topsis.items).toHaveLength(10);
    for (const item of topsis.items) {
      expect(item.score).toBeGreaterThanOrEqual(0);
      expect(item.score).toBeLessThanOrEqual(1);
    }
    expect(topsis.candidateCount).toBe(sum.candidateCount);
  });

  it('records every run, with its preferences, strategy and ordering', async () => {
    const result = await recommend({
      preferences: preferences(),
      limit: 4,
      experimentKey: 'thesis-run-1',
    });

    const session = await app
      .prisma()
      .recommendationSession.findUnique({ where: { id: result.sessionId } });

    expect(session).not.toBeNull();
    expect(session?.strategy).toBe('MCDA');
    expect(session?.experimentKey).toBe('thesis-run-1');
    const stored = session?.results as { listingId: string; rank: number }[];
    expect(stored).toHaveLength(4);
    expect(stored.map((entry) => entry.listingId)).toEqual(
      result.items.map((item) => item.listing.id),
    );
  });

  it('scores on the model’s estimate when one is available', async () => {
    const result = await recommend({ preferences: preferences(), limit: 1 });

    expect(result.omittedCriteria).toEqual([]);
    expect(result.items[0]?.breakdown.map((entry) => entry.criterion)).toContain('value');
  });

  it('ranks without the value criterion when the model is unavailable, and says so', async () => {
    stub.available = false;
    try {
      const result = await recommend({ preferences: preferences(), limit: 3 });

      expect(result.omittedCriteria).toEqual(['value']);
      expect(result.items).toHaveLength(3);
      for (const item of result.items) {
        expect(item.breakdown.map((entry) => entry.criterion)).not.toContain('value');
        // The remaining weights still sum to one, so the score stays comparable.
        expect(item.breakdown.reduce((sum, entry) => sum + entry.weight, 0)).toBeCloseTo(1, 3);
      }
    } finally {
      stub.available = true;
    }
  });

  it('returns nothing, rather than failing, when no listing meets the limits', async () => {
    const result = await recommend({
      preferences: preferences({ budgetAmd: 1_000_000, roomsMin: 9, roomsMax: 10 }),
      limit: 5,
    });

    expect(result.candidateCount).toBe(0);
    expect(result.items).toEqual([]);
  });

  it('explains every result from the arithmetic that placed it', async () => {
    const result = await recommend({ preferences: preferences(), limit: 5 });

    for (const item of result.items) {
      const criteria = new Set(item.breakdown.map((entry) => entry.criterion));
      for (const highlight of item.explanation.highlights) {
        // A reason the ranking did not actually use would be a story about the
        // listing rather than an account of its position.
        expect(criteria.has(highlight.criterion)).toBe(true);
        expect(highlight.score).toBeGreaterThanOrEqual(0);
        expect(highlight.score).toBeLessThanOrEqual(1);
      }
      expect(item.explanation.highlights.length).toBeLessThanOrEqual(4);
    }
  });

  it('explains itself with no model configured, and says where that came from', async () => {
    // The test app runs the rule-based provider, which is also the default for a
    // fresh checkout. The explanations are still complete; only the prose is not
    // there, and a client renders the highlights in any of the three languages.
    const result = await recommend({ preferences: preferences(), limit: 3 });

    expect(result.explanationSource).toBe('no-provider');
    for (const item of result.items) {
      expect(item.explanation.text).toBeUndefined();
      expect(item.explanation.highlights.length).toBeGreaterThan(0);
    }
  });

  it('skips the model entirely when the caller does not want prose', async () => {
    const result = await recommend({ preferences: preferences(), limit: 3, explain: false });

    expect(result.explanationSource).toBe('disabled');
    expect(result.items[0]?.explanation.highlights.length).toBeGreaterThan(0);
  });

  it('names the trade-offs, not only the strengths', async () => {
    // A recommender that lists only reasons to say yes is an advertisement. Over
    // a page of results at least one listing should be admitting to something.
    const result = await recommend({ preferences: preferences(), limit: 10 });

    const kinds = result.items.flatMap((item) =>
      item.explanation.highlights.map((highlight) => highlight.kind),
    );
    expect(kinds).toContain('tradeoff');
    expect(kinds).toContain('strength');
  });

  it('stores the reasons with the run, and no trace when no model was reached', async () => {
    const result = await recommend({ preferences: preferences(), limit: 3 });

    const session = await app
      .prisma()
      .recommendationSession.findUnique({ where: { id: result.sessionId } });

    const stored = session?.results as { explanation: { highlights: unknown[] } }[];
    expect(stored[0]?.explanation.highlights).toEqual(result.items[0]?.explanation.highlights);
    expect(session?.llmTrace).toBeNull();
    const inputs = session?.preferences as { explanationSource: string };
    expect(inputs.explanationSource).toBe('no-provider');
  });

  it('rejects preferences it cannot act on', async () => {
    const response = await app.request('POST', '/api/recommendations', {
      body: { preferences: { budgetAmd: -5 } },
    });

    expect(response.statusCode).toBe(400);
  });
});
