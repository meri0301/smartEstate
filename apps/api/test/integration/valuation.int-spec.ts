/**
 * The valuation endpoint against the real application and database, with a stub
 * standing in for the Python service.
 *
 * The stub is a real HTTP server rather than a mocked `fetch`, so the client's
 * timeout, status handling and response parsing are all exercised: those are
 * exactly the parts that decide whether a listing page degrades gracefully or
 * breaks when the model is having a bad day.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { ApiError, ListingSummary, Page, Valuation } from '@smartestate/contracts';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { startTestApp, type TestApp } from './setup/test-app.js';

const MODEL_VERSION = 'valuation-lgbm-test-00000000';

interface StubBehaviour {
  /** Status for every route; 503 imitates a service with no model loaded. */
  status: number;
  priceAmd: number;
  explainCalls: number;
  modelCalls: number;
  /** Milliseconds to wait before answering, for the timeout case. */
  delayMs: number;
}

const stub: StubBehaviour = {
  status: 200,
  priceAmd: 39_600_000,
  explainCalls: 0,
  modelCalls: 0,
  delayMs: 0,
};

function resetStub(): void {
  stub.status = 200;
  stub.priceAmd = 39_600_000;
  stub.explainCalls = 0;
  stub.modelCalls = 0;
  stub.delayMs = 0;
}

function startStub(): Promise<{ server: Server; baseUrl: string }> {
  const server = createServer((request, response) => {
    const answer = (): void => {
      if (stub.status !== 200) {
        response.writeHead(stub.status, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ detail: 'No valuation model is loaded.' }));
        return;
      }
      if (request.url === '/model') {
        stub.modelCalls += 1;
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(
          JSON.stringify({
            modelVersion: MODEL_VERSION,
            trainedAt: '2026-09-14T00:00:00+00:00',
            trainingRows: 300,
          }),
        );
        return;
      }
      stub.explainCalls += 1;
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(
        JSON.stringify({
          modelVersion: MODEL_VERSION,
          estimate: {
            pricePerSqmAmd: 550_000,
            priceAmd: stub.priceAmd,
            lowPriceAmd: stub.priceAmd * 0.8,
            highPriceAmd: stub.priceAmd * 1.2,
          },
          baselinePricePerSqmAmd: 500_000,
          contributions: [
            { feature: 'district_slug', value: 'arabkir', effect: 0.2, logContribution: 0.1823 },
            { feature: 'floor', value: 4, effect: -0.05, logContribution: -0.0513 },
          ],
          deviation: 0.1364,
          verdict: 'FAIR',
        }),
      );
    };
    if (stub.delayMs > 0) {
      setTimeout(answer, stub.delayMs);
    } else {
      answer();
    }
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({ server, baseUrl: `http://127.0.0.1:${String(port)}` });
    });
  });
}

describe('listing valuation', () => {
  let app: TestApp;
  let server: Server;
  let listingId: string;

  beforeAll(async () => {
    const started = await startStub();
    server = started.server;
    // A short timeout keeps the slow-service test quick.
    app = await startTestApp({ ML_BASE_URL: started.baseUrl, ML_TIMEOUT_MS: '400' });

    const page = await app.request('GET', '/api/listings?limit=1');
    listingId = page.json<Page<ListingSummary>>().items[0]?.id ?? '';
    expect(listingId).not.toBe('');
  });

  afterEach(async () => {
    resetStub();
    // Each test starts from a listing that has never been valued.
    await app.prisma().valuationRecord.deleteMany({ where: { listingId } });
  });

  afterAll(async () => {
    await app.close();
    await new Promise<void>((resolve) =>
      server.close(() => {
        resolve();
      }),
    );
  });

  it('values a listing and says why', async () => {
    const response = await app.request('GET', `/api/listings/${listingId}/valuation`);

    expect(response.statusCode).toBe(200);
    const valuation = response.json<Valuation>();
    expect(valuation.listingId).toBe(listingId);
    expect(valuation.modelVersion).toBe(MODEL_VERSION);
    expect(valuation.fairPriceAmd).toBe(39_600_000);
    expect(valuation.lowerBoundAmd).toBeLessThan(valuation.fairPriceAmd);
    expect(valuation.upperBoundAmd).toBeGreaterThan(valuation.fairPriceAmd);
    expect(valuation.verdict).toBe('FAIR');
    expect(valuation.isStale).toBe(false);
    expect(valuation.factors).toHaveLength(2);
    expect(valuation.factors[0]?.feature).toBe('district_slug');
    expect(valuation.factors[0]?.impactAmd).toBeGreaterThan(0);
  });

  it('writes every valuation down, with the model that produced it', async () => {
    await app.request('GET', `/api/listings/${listingId}/valuation`);

    const records = await app.prisma().valuationRecord.findMany({ where: { listingId } });
    expect(records).toHaveLength(1);
    expect(records[0]?.modelVersion).toBe(MODEL_VERSION);
    expect(Number(records[0]?.fairPriceAmd)).toBe(39_600_000);
  });

  it('reuses the stored valuation rather than asking the model twice', async () => {
    await app.request('GET', `/api/listings/${listingId}/valuation`);
    const callsAfterFirst = stub.explainCalls;

    const second = await app.request('GET', `/api/listings/${listingId}/valuation`);

    expect(second.statusCode).toBe(200);
    expect(stub.explainCalls).toBe(callsAfterFirst);
    expect(await app.prisma().valuationRecord.count({ where: { listingId } })).toBe(1);
  });

  it('serves the last known figure when the model service has nothing to offer', async () => {
    await app.request('GET', `/api/listings/${listingId}/valuation`);
    stub.status = 503;

    const response = await app.request('GET', `/api/listings/${listingId}/valuation`);

    expect(response.statusCode).toBe(200);
    expect(response.json<Valuation>().fairPriceAmd).toBe(39_600_000);
  });

  it('reports unavailable when there is no model and nothing stored', async () => {
    stub.status = 503;

    const response = await app.request('GET', `/api/listings/${listingId}/valuation`);

    expect(response.statusCode).toBe(503);
    expect(response.json<ApiError>().code).toBe('ML_UNAVAILABLE');
  });

  it('gives up on a slow model rather than holding the page open', async () => {
    stub.delayMs = 1_500;

    const response = await app.request('GET', `/api/listings/${listingId}/valuation`);

    expect(response.statusCode).toBe(503);
    expect(response.json<ApiError>().code).toBe('ML_UNAVAILABLE');
  });

  it('404s a listing that does not exist', async () => {
    const response = await app.request(
      'GET',
      '/api/listings/018f6d3e-7b6c-7c3a-9a0e-1f2b3c4d5e6f/valuation',
    );

    expect(response.statusCode).toBe(404);
  });

  it('rejects an id that is not a uuid', async () => {
    const response = await app.request('GET', '/api/listings/not-an-id/valuation');

    expect(response.statusCode).toBe(400);
  });
});
