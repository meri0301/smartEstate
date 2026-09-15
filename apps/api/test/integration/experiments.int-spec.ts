/**
 * The A/B harness end to end: assign, expose, act, measure.
 *
 * The properties a thesis has to be able to defend: the same subject always
 * gets the same arm; a run under an experiment records which arm served it; an
 * outcome can only be attributed to a session that actually showed the listing;
 * and the results refuse to compare arms until every arm has enough sessions to
 * make a comparison mean anything.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type {
  Experiment,
  ExperimentResults,
  RecommendationRequestInput,
  RecommendationResponse,
} from '@smartestate/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startTestApp, type TestApp } from './setup/test-app.js';

/** A valuation service that answers, so both arms rank on all seven criteria. */
function startValuationStub(): Promise<{ server: Server; baseUrl: string }> {
  const server = createServer((request, response) => {
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
          estimates: parsed.listings.map((entry) => {
            const priceAmd = 700_000 * entry.totalArea;
            return {
              pricePerSqmAmd: 700_000,
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

const EXPERIMENT = 'ranking-method';

describe('the A/B harness', () => {
  let app: TestApp;
  let server: Server;

  const request: RecommendationRequestInput = {
    preferences: { budgetAmd: 60_000_000, roomsMin: 2, roomsMax: 3 },
    limit: 10,
    experimentKey: EXPERIMENT,
    explain: false,
  };

  const recommendAs = async (anonymousId: string): Promise<RecommendationResponse> => {
    const response = await app.request('POST', '/api/recommendations?locale=en', {
      body: request,
      headers: { 'x-anonymous-id': anonymousId },
    });
    expect(response.statusCode).toBe(200);
    return response.json<RecommendationResponse>();
  };

  const results = async (): Promise<ExperimentResults> => {
    const response = await app.request('GET', `/api/experiments/${EXPERIMENT}/results`);
    expect(response.statusCode).toBe(200);
    return response.json<ExperimentResults>();
  };

  beforeAll(async () => {
    const stub = await startValuationStub();
    server = stub.server;
    app = await startTestApp({ ML_BASE_URL: stub.baseUrl });
  });

  afterAll(async () => {
    await app.close();
    await new Promise<void>((resolve) => {
      server.close(() => {
        resolve();
      });
    });
  });

  it('lists the seeded experiment with two arms at equal allocation', async () => {
    const response = await app.request('GET', '/api/experiments');
    const experiments = response.json<Experiment[]>();

    const seeded = experiments.find((entry) => entry.key === EXPERIMENT);
    expect(seeded?.arms.map((arm) => arm.method)).toEqual(['WEIGHTED_SUM', 'TOPSIS']);
    expect(seeded?.arms.every((arm) => arm.weight === 1)).toBe(true);
    expect(seeded?.isActive).toBe(true);
  });

  it('serves an arm, and the arm decides the method', async () => {
    const result = await recommendAs('browser-1');

    expect(result.arm).toMatch(/^[AB]$/);
    expect(result.method).toBe(result.arm === 'A' ? 'WEIGHTED_SUM' : 'TOPSIS');
  });

  it('is sticky for a subject across requests', async () => {
    const first = await recommendAs('browser-2');
    const second = await recommendAs('browser-2');
    const third = await recommendAs('browser-2');

    expect(second.arm).toBe(first.arm);
    expect(third.arm).toBe(first.arm);
  });

  it('assigns different subjects to both arms', async () => {
    const arms = new Set<string>();
    for (let i = 0; i < 24 && arms.size < 2; i += 1) {
      arms.add((await recommendAs(`spread-${String(i)}`)).arm ?? '');
    }

    expect(arms).toEqual(new Set(['A', 'B']));
  });

  it('records the arm on the stored session', async () => {
    const result = await recommendAs('browser-3');
    const session = await app
      .prisma()
      .recommendationSession.findUnique({ where: { id: result.sessionId } });

    expect(session?.arm).toBe(result.arm);
    expect(session?.experimentKey).toBe(EXPERIMENT);
    expect(session?.anonymousId).toBe('browser-3');
  });

  it('runs as asked and records no arm when nobody can be identified', async () => {
    // Without a subject there is nothing to be sticky to, and a random
    // assignment would be an experiment on nobody.
    const response = await app.request('POST', '/api/recommendations?locale=en', {
      body: { ...request, method: 'TOPSIS' },
    });
    const result = response.json<RecommendationResponse>();

    expect(result.arm).toBeUndefined();
    expect(result.method).toBe('TOPSIS');
  });

  it('ignores the request’s own method under an experiment', async () => {
    const asked = await app.request('POST', '/api/recommendations?locale=en', {
      body: { ...request, method: 'TOPSIS' },
      headers: { 'x-anonymous-id': 'browser-4' },
    });
    const result = asked.json<RecommendationResponse>();

    // The point of the experiment is that the client does not pick.
    expect(result.method).toBe(result.arm === 'A' ? 'WEIGHTED_SUM' : 'TOPSIS');
  });

  describe('outcomes', () => {
    it('attributes an interaction to the session that showed the listing', async () => {
      const served = await recommendAs('browser-5');
      const shown = served.items[0]?.listing.id ?? '';

      const response = await app.request('POST', '/api/interactions', {
        body: { listingId: shown, type: 'FAVORITE', sessionId: served.sessionId },
        headers: { 'x-anonymous-id': 'browser-5' },
      });

      expect(response.statusCode).toBe(201);
      const stored = await app.prisma().userInteraction.findFirst({
        where: { listingId: shown, anonymousId: 'browser-5' },
      });
      expect(stored?.sessionId).toBe(served.sessionId);
    });

    it('drops a session attribution for a listing that session never showed', async () => {
      // A client cannot put a thumb on the scale by attributing outcomes to a
      // ranking that did not produce them.
      const served = await recommendAs('browser-6');
      const page = await app.request('GET', '/api/listings?sort=price_desc&limit=1');
      const notShown = page.json<{ items: { id: string }[] }>().items[0]?.id ?? '';
      expect(served.items.some((item) => item.listing.id === notShown)).toBe(false);

      await app.request('POST', '/api/interactions', {
        body: { listingId: notShown, type: 'VIEW', sessionId: served.sessionId },
        headers: { 'x-anonymous-id': 'browser-6' },
      });

      const stored = await app.prisma().userInteraction.findFirst({
        where: { listingId: notShown, anonymousId: 'browser-6' },
      });
      expect(stored).not.toBeNull();
      expect(stored?.sessionId).toBeNull();
    });

    it('404s for a listing that does not exist', async () => {
      const response = await app.request('POST', '/api/interactions', {
        body: { listingId: '018f6d3e-7b6c-7c3a-9a0e-000000000000', type: 'VIEW' },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('results', () => {
    it('counts sessions per arm and reports the k and the gains it used', async () => {
      const summary = await results();

      expect(summary.experiment.key).toBe(EXPERIMENT);
      expect(summary.k).toBe(10);
      expect(summary.relevanceGains.FAVORITE).toBeGreaterThan(summary.relevanceGains.VIEW);
      expect(summary.relevanceGains.DISMISS).toBe(0);
      const total = summary.arms.reduce((sum, arm) => sum + arm.sessions, 0);
      expect(total).toBeGreaterThan(0);
    });

    it('refuses to compare arms below the published minimum', async () => {
      // Fewer than thirty sessions in an arm and a difference is a story, not a
      // finding. The page says "not yet" instead of implying a winner.
      const summary = await results();

      expect(summary.minimumSessionsPerArm).toBe(30);
      expect(summary.sufficient).toBe(false);
      expect(summary.comparisons).toEqual([]);
    });

    it('scores a favourited top result as a perfect ranking for that session', async () => {
      const served = await recommendAs('browser-7');
      const top = served.items[0]?.listing.id ?? '';
      await app.request('POST', '/api/interactions', {
        body: { listingId: top, type: 'FAVORITE', sessionId: served.sessionId },
        headers: { 'x-anonymous-id': 'browser-7' },
      });

      const summary = await results();
      const arm = summary.arms.find((entry) => entry.arm.name === served.arm);

      expect(arm?.sessionsWithFeedback).toBeGreaterThan(0);
      // With one favourite at the top, NDCG for that session is 1 and precision
      // is 1/k; the arm's means cannot exceed 1.
      expect(arm?.ndcgAtK.mean).toBeGreaterThan(0);
      expect(arm?.ndcgAtK.mean).toBeLessThanOrEqual(1);
      expect(arm?.precisionAtK.mean).toBeGreaterThan(0);
    });

    it('compares arms once every arm has enough sessions', async () => {
      // Fill both arms past the minimum with distinct subjects.
      for (let i = 0; i < 90; i += 1) {
        await recommendAs(`bulk-${String(i)}`);
      }

      const summary = await results();

      expect(summary.sufficient).toBe(true);
      expect(summary.comparisons.length).toBe(3);
      for (const comparison of summary.comparisons) {
        expect(comparison.arms).toEqual(['A', 'B']);
        expect(comparison.confidenceLow).toBeLessThanOrEqual(comparison.difference);
        expect(comparison.confidenceHigh).toBeGreaterThanOrEqual(comparison.difference);
      }
    });

    it('404s for an experiment nobody defined', async () => {
      const response = await app.request('GET', '/api/experiments/nope/results');

      expect(response.statusCode).toBe(404);
    });
  });
});
