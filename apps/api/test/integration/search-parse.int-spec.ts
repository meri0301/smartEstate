/**
 * The parse endpoint against the real application and database.
 *
 * Districts come from the seeded database rather than a fixture, which is the
 * point: the vocabulary the parser matches against is whatever has been seeded,
 * so a district added tomorrow is searchable without a code change.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { ParsedQuery } from '@smartestate/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startTestApp, type TestApp } from './setup/test-app.js';

/** Stands in for Ollama, so the model path can be exercised without one. */
const stub = {
  content: JSON.stringify({
    filters: { roomsMin: 4, roomsMax: 4, districts: ['avan'] },
    unmapped: ['sunny'],
  }),
  status: 200,
  calls: 0,
};

function startStub(): Promise<{ server: Server; baseUrl: string }> {
  const server = createServer((_request, response) => {
    stub.calls += 1;
    response.writeHead(stub.status, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ message: { content: stub.content } }));
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve({
        server,
        baseUrl: `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`,
      });
    });
  });
}

describe('parsing a search sentence', () => {
  let rules: TestApp;

  beforeAll(async () => {
    // The default provider: no model, so the deterministic parser answers.
    rules = await startTestApp({ LLM_PROVIDER: 'rule-based' });
  });

  afterAll(async () => {
    await rules.close();
  });

  const parse = async (query: string): Promise<ParsedQuery> => {
    const response = await rules.request('POST', '/api/search/parse?locale=en', {
      body: { query },
    });
    expect(response.statusCode).toBe(200);
    return response.json<ParsedQuery>();
  };

  it('works with no model configured at all', async () => {
    const result = await parse('2 rooms in Arabkir under 60 million');

    expect(result.source).toBe('no-provider');
    expect(result.filters).toMatchObject({
      roomsMin: 2,
      roomsMax: 2,
      districts: ['arabkir'],
      priceMax: 60_000_000,
    });
  });

  it('matches districts that were seeded, in any of the three languages', async () => {
    expect((await parse('квартира в Кентрон')).filters.districts).toEqual(['kentron']);
    expect((await parse('բնակարան Արաբկիրում')).filters.districts).toEqual(['arabkir']);
  });

  it('echoes the query and reports what it could not place', async () => {
    const result = await parse('quiet flat near a school in Kentron');

    expect(result.query).toBe('quiet flat near a school in Kentron');
    expect(result.unmapped).toContain('quiet');
    expect(result.unmapped).toContain('school');
    expect(result.filters.districts).toEqual(['kentron']);
  });

  it('returns no filters rather than guessing at a sentence it cannot read', async () => {
    const result = await parse('something lovely please');

    expect(result.filters).toEqual({});
    expect(result.unmapped.length).toBeGreaterThan(0);
  });

  it('produces filters the listing search accepts', async () => {
    const parsed = await parse('3 rooms in Kentron under 90 million, not ground floor');

    const search = new URLSearchParams({ limit: '5' });
    for (const [key, value] of Object.entries(parsed.filters)) {
      search.set(key, Array.isArray(value) ? value.join(',') : String(value));
    }
    const response = await rules.request('GET', `/api/listings?${search.toString()}`);

    expect(response.statusCode).toBe(200);
  });

  it('refuses an empty query', async () => {
    const response = await rules.request('POST', '/api/search/parse', { body: { query: '   ' } });

    expect(response.statusCode).toBe(400);
  });

  it('refuses a query long enough to be an attack rather than a search', async () => {
    const response = await rules.request('POST', '/api/search/parse', {
      body: { query: 'a'.repeat(400) },
    });

    expect(response.statusCode).toBe(400);
  });
});

describe('parsing with a model available', () => {
  let app: TestApp;
  let server: Server;

  beforeAll(async () => {
    const started = await startStub();
    server = started.server;
    app = await startTestApp({
      LLM_PROVIDER: 'ollama',
      OLLAMA_BASE_URL: started.baseUrl,
      // Redis is not assumed in the test environment; without it every call
      // reaches the stub, which is what these tests want to observe.
      LLM_REQUESTS_PER_MINUTE: '100',
    });
  });

  afterAll(async () => {
    await app.close();
    await new Promise<void>((resolve) => {
      server.close(() => {
        resolve();
      });
    });
  });

  const parse = async (query: string): Promise<ParsedQuery> => {
    const response = await app.request('POST', '/api/search/parse', { body: { query } });
    expect(response.statusCode).toBe(200);
    return response.json<ParsedQuery>();
  };

  it('prefers the model when it answers with a valid shape', async () => {
    stub.content = JSON.stringify({
      filters: { roomsMin: 4, roomsMax: 4, districts: ['avan'] },
      unmapped: ['sunny'],
    });

    const result = await parse('a sunny four-room place in Avan');

    expect(result.source).toBe('model');
    expect(result.filters).toMatchObject({ roomsMin: 4, roomsMax: 4, districts: ['avan'] });
    expect(result.unmapped).toEqual(['sunny']);
  });

  it('discards a model answer that invents a district, and uses the rules instead', async () => {
    // `districts` is constrained to the slug pattern, and this is not one.
    stub.content = JSON.stringify({ filters: { districts: ['Atlantis'] }, unmapped: [] });

    const result = await parse('2 rooms in Arabkir');

    expect(result.source).toBe('invalid');
    expect(result.filters).toMatchObject({ roomsMin: 2, districts: ['arabkir'] });
  });

  it('falls back to the rules when the model answers with prose', async () => {
    stub.content = 'I think you want something in Arabkir';

    const result = await parse('2 rooms in Arabkir under 50 million');

    expect(result.source).toBe('invalid');
    expect(result.filters).toMatchObject({ roomsMin: 2, priceMax: 50_000_000 });
  });

  it('falls back to the rules when the model cannot be reached', async () => {
    stub.status = 500;
    try {
      const result = await parse('3 rooms in Kentron');

      expect(result.source).toBe('error');
      expect(result.filters).toMatchObject({ roomsMin: 3, districts: ['kentron'] });
    } finally {
      stub.status = 200;
    }
  });
});
