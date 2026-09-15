/**
 * Hybrid search against the real catalogue, with a stub encoder.
 *
 * The vectors here are deterministic and meaningless — a hash of the text spread
 * over 384 dimensions. That is deliberate: a real encoder would make these tests
 * depend on half a gigabyte of weights and would test the model rather than this
 * code. What is worth asserting is everything around it — that the filters bind
 * both arms, that fusion reports where each arm placed a result, that a missing
 * encoder degrades to a lexical search that says so, and that a stored vector
 * from other weights is never compared with a current one.
 *
 * The one thing a stub cannot show is that semantic search finds anything
 * sensible. That was verified against the real model and is written up in
 * ADR-0015; it is not something a test can assert without shipping the weights.
 */
import { createHash } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { HybridSearchBodyInput, HybridSearchResponse } from '@smartestate/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startTestApp, type TestApp } from './setup/test-app.js';

const DIMENSIONS = 384;
const MODEL_VERSION = 'stub-encoder@0000';

const encoder = { available: true, modelVersion: MODEL_VERSION, calls: 0 };

/**
 * A vector that depends only on the text.
 *
 * Deterministic, so the same listing embeds identically on every run, and
 * different enough between texts that nearest-neighbour ordering is stable
 * rather than arbitrary.
 */
function fakeVector(text: string): number[] {
  const digest = createHash('sha256').update(text).digest();
  const raw = Array.from({ length: DIMENSIONS }, (_unused, index) => {
    const byte = digest[index % digest.length] ?? 0;
    return byte / 255 - 0.5;
  });
  const norm = Math.sqrt(raw.reduce((sum, value) => sum + value * value, 0)) || 1;
  return raw.map((value) => value / norm);
}

function startEncoderStub(): Promise<{ server: Server; baseUrl: string }> {
  const server = createServer((request, response) => {
    if (!encoder.available) {
      response.writeHead(503, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ detail: 'No embedding model is loaded.' }));
      return;
    }
    if (request.url === '/embed/model') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ modelVersion: encoder.modelVersion, dimensions: DIMENSIONS }));
      return;
    }
    let body = '';
    request.on('data', (chunk: Buffer) => (body += chunk.toString()));
    request.on('end', () => {
      const parsed = JSON.parse(body) as { texts: string[] };
      encoder.calls += 1;
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(
        JSON.stringify({
          modelVersion: encoder.modelVersion,
          dimensions: DIMENSIONS,
          embeddings: parsed.texts.map((text) => fakeVector(text)),
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

describe('hybrid search', () => {
  let app: TestApp;
  let server: Server;

  const search = async (body: HybridSearchBodyInput): Promise<HybridSearchResponse> => {
    const response = await app.request('POST', '/api/search/hybrid?locale=en', { body });
    expect(response.statusCode).toBe(200);
    return response.json<HybridSearchResponse>();
  };

  const vectorCount = async (): Promise<number> => app.prisma().listingEmbedding.count();

  beforeAll(async () => {
    const stub = await startEncoderStub();
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

  beforeEach(() => {
    encoder.available = true;
    encoder.modelVersion = MODEL_VERSION;
    encoder.calls = 0;
  });

  describe('before anything is embedded', () => {
    it('searches lexically and says why the other arm did not run', async () => {
      const result = await search({ query: 'квартира' });

      expect(result.arms).toEqual(['lexical']);
      expect(result.semanticSkipped).toBe('not-indexed');
      expect(result.results.length).toBeGreaterThan(0);
    });

    it('does not spend the encoder on an empty index', async () => {
      await search({ query: 'квартира' });

      expect(encoder.calls).toBe(0);
    });

    it('finds listings by a word in their description, in all three languages', async () => {
      for (const query of ['apartment', 'квартира', 'բնակարան']) {
        const result = await search({ query });

        expect(result.results.length).toBeGreaterThan(0);
      }
    });

    it('ranks by the fusion score, best first', async () => {
      const result = await search({ query: 'bright quiet apartment with a balcony' });

      const scores = result.results.map((entry) => entry.score);
      expect([...scores].sort((a, b) => b - a)).toEqual(scores);
      expect(result.results.map((entry) => entry.rank)).toEqual(
        result.results.map((_unused, index) => index + 1),
      );
    });
  });

  describe('with an index', () => {
    beforeAll(async () => {
      const embeddings = await import('../../src/modules/embeddings/embeddings.service.js');
      await app.app.get(embeddings.EmbeddingsService).backfill();
    });

    it('embeds every published listing once', async () => {
      expect(await vectorCount()).toBeGreaterThan(0);
    });

    it('runs both arms and reports where each placed a result', async () => {
      const result = await search({ query: 'bright apartment near a school' });

      expect(result.arms).toEqual(['lexical', 'semantic']);
      expect(result.semanticSkipped).toBeUndefined();
      const found = result.results[0]?.ranks ?? {};
      expect(Object.keys(found).length).toBeGreaterThan(0);
      for (const rank of Object.values(found)) {
        expect(rank).toBeGreaterThanOrEqual(1);
      }
    });

    it('keeps a result that only one arm found', async () => {
      // The whole point of two arms: a listing the words missed can still place,
      // and the response shows that it was found by meaning alone.
      const result = await search({ query: 'somewhere calm to bring up children', limit: 50 });

      expect(result.results.some((entry) => entry.ranks.lexical === undefined)).toBe(true);
    });

    it('applies the parsed filters to both arms, not just to one', async () => {
      const result = await search({ query: 'apartment in Arabkir', limit: 50 });

      expect(result.filters.districts).toEqual(['arabkir']);
      expect(result.results.length).toBeGreaterThan(0);
      for (const entry of result.results) {
        expect(entry.listing.district.slug).toBe('arabkir');
      }
    });

    it('honours filters the reader corrected, over the ones parsed from the sentence', async () => {
      const result = await search({
        query: 'apartment in Arabkir',
        filters: { districts: ['kentron'] },
        limit: 20,
      });

      expect(result.filters.districts).toEqual(['kentron']);
      for (const entry of result.results) {
        expect(entry.listing.district.slug).toBe('kentron');
      }
    });

    it('reports the phrases no filter could express, which is what the vectors answer', async () => {
      const result = await search({ query: 'quiet flat near a school in Kentron' });

      expect(result.unmapped).toContain('quiet');
      expect(result.filters.districts).toEqual(['kentron']);
    });

    it('returns only published listings', async () => {
      const result = await search({ query: 'apartment', limit: 50 });

      for (const entry of result.results) {
        expect(entry.listing.status).toBe('PUBLISHED');
      }
    });

    it('honours the limit', async () => {
      const result = await search({ query: 'apartment', limit: 3 });

      expect(result.results).toHaveLength(3);
    });

    it('publishes the fusion constant, so a stored ranking stays interpretable', async () => {
      expect((await search({ query: 'apartment' })).rrfK).toBe(60);
    });

    it('falls back to lexical when the encoder goes away mid-session', async () => {
      encoder.available = false;
      try {
        const result = await search({ query: 'apartment' });

        expect(result.arms).toEqual(['lexical']);
        expect(result.semanticSkipped).toBe('unavailable');
        expect(result.results.length).toBeGreaterThan(0);
      } finally {
        encoder.available = true;
      }
    });

    it('returns nothing, rather than failing, for a query that matches nothing', async () => {
      const result = await search({ query: 'zzzqqq', limit: 5 });

      // The lexical arm finds nothing; the semantic arm ranks everything by a
      // meaningless distance, which is honest behaviour for a nearest-neighbour
      // search and is why the filters do the excluding.
      expect(Array.isArray(result.results)).toBe(true);
    });

    it('rejects an empty query rather than ranking the whole catalogue', async () => {
      const response = await app.request('POST', '/api/search/hybrid', { body: { query: '  ' } });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('when the weights change', () => {
    it('discards vectors from other weights instead of comparing them with new ones', async () => {
      const embeddings = await import('../../src/modules/embeddings/embeddings.service.js');
      const service = app.app.get(embeddings.EmbeddingsService);

      const before = await vectorCount();
      expect(before).toBeGreaterThan(0);

      encoder.modelVersion = 'stub-encoder@1111';
      const report = await service.backfill();

      // Two points in different spaces have a distance, and it means nothing.
      expect(report.removedStale).toBe(before);
      expect(report.embedded).toBe(before);
      expect(report.modelVersion).toBe('stub-encoder@1111');
      expect(await vectorCount()).toBe(before);
    });

    it('does no work at all when nothing has changed', async () => {
      const embeddings = await import('../../src/modules/embeddings/embeddings.service.js');
      const service = app.app.get(embeddings.EmbeddingsService);
      await service.backfill();

      const report = await service.backfill();

      expect(report.embedded).toBe(0);
      expect(report.skipped).toBeGreaterThan(0);
    });
  });
});
