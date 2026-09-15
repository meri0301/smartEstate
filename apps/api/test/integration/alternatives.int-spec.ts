/**
 * The "better option" engine against the real catalogue.
 *
 * The properties worth asserting here are the ones a buyer would be misled by if
 * they failed: that nothing offered is worse overall than what they are looking
 * at, that every comparison carries both figures, that the candidates are
 * genuinely switchable, and that the claim shrinks honestly when a criterion
 * cannot be measured.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { AlternativesResponse, ListingsPage } from '@smartestate/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startTestApp, type TestApp } from './setup/test-app.js';

const valuation = { available: true };

/** Prices every listing at a flat rate per square metre, so deviations vary. */
function startValuationStub(): Promise<{ server: Server; baseUrl: string }> {
  const server = createServer((request, response) => {
    if (!valuation.available) {
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
          estimates: parsed.listings.map((entry) => {
            const pricePerSqmAmd = 700_000;
            const priceAmd = pricePerSqmAmd * entry.totalArea;
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

describe('alternatives', () => {
  let app: TestApp;
  let server: Server;
  /** A listing with plenty of company: same district, same room count. */
  let subjectId: string;

  const alternativesFor = async (id: string, query = ''): Promise<AlternativesResponse> => {
    const response = await app.request('GET', `/api/listings/${id}/alternatives?locale=en${query}`);
    expect(response.statusCode).toBe(200);
    return response.json<AlternativesResponse>();
  };

  beforeAll(async () => {
    const stub = await startValuationStub();
    server = stub.server;
    app = await startTestApp({ ML_BASE_URL: stub.baseUrl });

    // Pick a mid-priced two-room flat in the busiest district, so there is
    // something to compare it with.
    const page = await app.request(
      'GET',
      '/api/listings?districts=kentron&roomsMin=2&roomsMax=2&sort=price_asc&limit=30',
    );
    const items = page.json<ListingsPage>().items;
    subjectId = items[Math.floor(items.length / 2)]?.id ?? items[0]?.id ?? '';
    expect(subjectId).not.toBe('');
  });

  afterAll(async () => {
    await app.close();
    await new Promise<void>((resolve) => {
      server.close(() => {
        resolve();
      });
    });
  });

  beforeEach(() => {
    valuation.available = true;
  });

  it('never offers something that is better at nothing', async () => {
    const result = await alternativesFor(subjectId, '&limit=12');

    for (const alternative of result.alternatives) {
      expect(alternative.betterCount).toBeGreaterThan(0);
    }
  });

  it('puts the options that give up nothing first', async () => {
    const result = await alternativesFor(subjectId, '&limit=12');

    const ranks = result.alternatives.map((entry) => (entry.relation === 'DOMINATES' ? 0 : 1));
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
  });

  it('calls it dominance only when nothing at all is given up', async () => {
    const result = await alternativesFor(subjectId, '&limit=12');

    for (const alternative of result.alternatives) {
      const worse = alternative.comparisons.filter((entry) => entry.direction === 'worse');
      if (alternative.relation === 'DOMINATES') {
        expect(worse).toHaveLength(0);
      } else {
        expect(worse.length).toBeGreaterThan(0);
      }
    }
  });

  it('carries both figures for every criterion, so a claim can be checked', async () => {
    const result = await alternativesFor(subjectId);
    const first = result.alternatives[0];

    expect(first).toBeDefined();
    for (const comparison of first?.comparisons ?? []) {
      expect(Number.isFinite(comparison.subject)).toBe(true);
      expect(Number.isFinite(comparison.alternative)).toBe(true);
      expect(result.criteria).toContain(comparison.criterion);
    }
  });

  it('agrees with itself: the direction follows from the two numbers', async () => {
    const result = await alternativesFor(subjectId, '&limit=12');

    for (const alternative of result.alternatives) {
      for (const comparison of alternative.comparisons) {
        if (comparison.direction === 'same') {
          continue;
        }
        const lowerIsBetter =
          comparison.criterion === 'price' ||
          comparison.criterion === 'location' ||
          comparison.criterion === 'value';
        const improved = lowerIsBetter
          ? comparison.alternative < comparison.subject
          : comparison.alternative > comparison.subject;
        expect(improved).toBe(comparison.direction === 'better');
      }
    }
  });

  it('only offers listings a buyer could actually switch to', async () => {
    const result = await alternativesFor(subjectId, '&limit=12');
    const subject = result.subject;

    for (const alternative of result.alternatives) {
      expect(alternative.listing.district.slug).toBe(subject.district.slug);
      expect(alternative.listing.rooms).toBeGreaterThanOrEqual(subject.rooms);
      expect(alternative.listing.priceAmd).toBeLessThanOrEqual(subject.priceAmd * 1.1);
      expect(alternative.listing.id).not.toBe(subject.id);
      expect(alternative.listing.status).toBe('PUBLISHED');
    }
  });

  it('honours the limit', async () => {
    expect((await alternativesFor(subjectId, '&limit=2')).alternatives.length).toBeLessThanOrEqual(
      2,
    );
  });

  it('compares value when the model answers, and says which criteria it used', async () => {
    const result = await alternativesFor(subjectId);

    expect(result.criteria).toContain('value');
    expect(result.criteria).toContain('price');
    expect(result.omittedCriteria).toEqual(['location']);
  });

  it('drops the value criterion when the model is unavailable, and says so', async () => {
    valuation.available = false;
    try {
      const result = await alternativesFor(subjectId, '&limit=12');

      expect(result.criteria).not.toContain('value');
      expect(result.omittedCriteria).toContain('value');
      for (const alternative of result.alternatives) {
        expect(alternative.comparisons.map((entry) => entry.criterion)).not.toContain('value');
      }
    } finally {
      valuation.available = true;
    }
  });

  it('compares location once the buyer names a place', async () => {
    const result = await alternativesFor(
      subjectId,
      '&limit=12&anchorLat=40.1772&anchorLon=44.5035',
    );

    expect(result.criteria).toContain('location');
    expect(result.omittedCriteria).toEqual([]);
    const distances = result.alternatives
      .flatMap((entry) => entry.comparisons)
      .filter((entry) => entry.criterion === 'location');
    expect(distances.length).toBeGreaterThan(0);
    for (const distance of distances) {
      expect(distance.unit).toBe('metres');
      expect(distance.alternative).toBeGreaterThanOrEqual(0);
    }
  });

  it('says how many listings it looked at', async () => {
    const result = await alternativesFor(subjectId);

    expect(result.candidateCount).toBeGreaterThan(0);
  });

  it('returns nothing, rather than padding, when a listing has no better option', async () => {
    // The cheapest listing in its district with the most rooms is hard to beat;
    // whatever comes back, an empty list is a valid and honest answer.
    const page = await app.request(
      'GET',
      '/api/listings?districts=nubarashen&sort=price_asc&limit=1',
    );
    const cheapest = page.json<ListingsPage>().items[0];
    expect(cheapest).toBeDefined();

    const result = await alternativesFor(cheapest?.id ?? '');

    expect(Array.isArray(result.alternatives)).toBe(true);
    for (const alternative of result.alternatives) {
      expect(alternative.betterCount).toBeGreaterThan(0);
    }
  });

  it('404s for a listing nobody can see', async () => {
    const response = await app.request(
      'GET',
      '/api/listings/018f6d3e-7b6c-7c3a-9a0e-000000000000/alternatives',
    );

    expect(response.statusCode).toBe(404);
  });

  it('rejects a limit it will not honour', async () => {
    const response = await app.request('GET', `/api/listings/${subjectId}/alternatives?limit=99`);

    expect(response.statusCode).toBe(400);
  });
});
