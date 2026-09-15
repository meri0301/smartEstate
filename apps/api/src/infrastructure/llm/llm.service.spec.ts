/**
 * The guardrail, tested as behaviour rather than as intention.
 *
 * Every test here answers the same question from a different angle: when the
 * model is missing, slow, over quota, broken or wrong, does the caller still get
 * a usable answer? A stub HTTP server stands in for Ollama so the provider,
 * timeout and parsing are all real; only Redis is faked, because it is a
 * key-value store and faking one is not a test seam.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { loadConfig, type AppConfig } from '../../config/app-config.js';
import type { RedisService } from '../redis/redis.service.js';
import { extractJson, LlmService } from './llm.service.js';

const schema = z.object({ rooms: z.number().int(), district: z.string() });
type Parsed = z.infer<typeof schema>;

const FALLBACK: Parsed = { rooms: 0, district: 'unknown' };

const BASE_ENV = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
  JWT_ACCESS_SECRET: 'x'.repeat(32),
};

/** Answers like Ollama, or misbehaves on demand. */
const stub = {
  status: 200,
  body: JSON.stringify({ message: { content: '{"rooms":2,"district":"kentron"}' } }),
  calls: 0,
  delayMs: 0,
};

function resetStub(): void {
  stub.status = 200;
  stub.body = JSON.stringify({ message: { content: '{"rooms":2,"district":"kentron"}' } });
  stub.calls = 0;
  stub.delayMs = 0;
}

/** A Redis that works, or one that is switched off, without a server either way. */
function fakeRedis(
  options: { connected?: boolean } = {},
): RedisService & { store: Map<string, string> } {
  const store = new Map<string, string>();
  const counters = new Map<string, number>();
  const connected = options.connected ?? true;
  return {
    store,
    connected,
    get: (key: string) => Promise.resolve(connected ? store.get(key) : undefined),
    set: (key: string, value: string) => {
      if (connected) {
        store.set(key, value);
      }
      return Promise.resolve();
    },
    increment: (key: string) => {
      if (!connected) {
        return Promise.resolve(undefined);
      }
      const next = (counters.get(key) ?? 0) + 1;
      counters.set(key, next);
      return Promise.resolve(next);
    },
    onModuleDestroy: () => Promise.resolve(),
  } as unknown as RedisService & { store: Map<string, string> };
}

function configFor(overrides: Record<string, string>): AppConfig {
  return loadConfig({ ...BASE_ENV, ...overrides });
}

function request(user = 'two rooms in Kentron') {
  return {
    task: 'parse-query' as const,
    system: 'Return JSON.',
    user,
    schema,
    fallback: () => FALLBACK,
  };
}

describe('extractJson', () => {
  it('returns plain JSON untouched', () => {
    expect(extractJson('{"a":1}')).toBe('{"a":1}');
  });

  it('unwraps a fenced block, which is what a chat model usually sends', () => {
    expect(extractJson('```json\n{"a":1}\n```')).toBe('{"a":1}');
    expect(extractJson('```\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it('finds the object inside a sentence', () => {
    expect(extractJson('Here you go: {"a":1} hope that helps')).toBe('{"a":1}');
  });

  it('finds an array as readily as an object', () => {
    expect(extractJson('Sure: [1,2,3]')).toBe('[1,2,3]');
  });

  it('hands back text with no JSON in it, for the schema check to reject', () => {
    expect(extractJson('I cannot help with that')).toBe('I cannot help with that');
  });
});

describe('LlmService', () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    server = createServer((_request, response) => {
      stub.calls += 1;
      const answer = (): void => {
        response.writeHead(stub.status, { 'content-type': 'application/json' });
        response.end(stub.body);
      };
      if (stub.delayMs > 0) {
        setTimeout(answer, stub.delayMs);
      } else {
        answer();
      }
    });
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        baseUrl = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => {
        resolve();
      });
    });
  });

  beforeEach(() => {
    resetStub();
  });

  const ollamaService = (overrides: Record<string, string> = {}, redis = fakeRedis()) =>
    new LlmService(
      configFor({ LLM_PROVIDER: 'ollama', OLLAMA_BASE_URL: baseUrl, ...overrides }),
      redis,
    );

  it('uses the model when one is available and answers correctly', async () => {
    const result = await ollamaService().structured(request());

    expect(result.source).toBe('model');
    expect(result.value).toEqual({ rooms: 2, district: 'kentron' });
    expect(result.provider).toBe('ollama');
    expect(stub.calls).toBe(1);
  });

  it('never calls anything with the rule-based provider, and says why', async () => {
    const service = new LlmService(configFor({ LLM_PROVIDER: 'rule-based' }), fakeRedis());

    const result = await service.structured(request());

    expect(result.source).toBe('no-provider');
    expect(result.value).toEqual(FALLBACK);
    expect(stub.calls).toBe(0);
    expect(service.enabled).toBe(false);
  });

  it('falls back when a provider is chosen but not configured', async () => {
    const service = new LlmService(
      configFor({ LLM_PROVIDER: 'gemini', GEMINI_API_KEY: '' }),
      fakeRedis(),
    );

    const result = await service.structured(request());

    expect(result.source).toBe('no-provider');
    expect(result.value).toEqual(FALLBACK);
  });

  it('falls back when the feature is switched off, without asking the provider', async () => {
    const result = await ollamaService({ LLM_ENABLED: 'false' }).structured(request());

    expect(result.source).toBe('disabled');
    expect(stub.calls).toBe(0);
  });

  it('falls back when the call fails', async () => {
    stub.status = 500;

    const result = await ollamaService().structured(request());

    expect(result.source).toBe('error');
    expect(result.value).toEqual(FALLBACK);
  });

  it('falls back when the model answers with prose instead of the shape asked for', async () => {
    stub.body = JSON.stringify({ message: { content: 'I think about two rooms would suit you' } });

    const result = await ollamaService().structured(request());

    expect(result.source).toBe('invalid');
    expect(result.value).toEqual(FALLBACK);
    // The raw answer is kept in the trace, which is how a bad prompt gets found.
    expect(result.trace.response).toContain('two rooms would suit you');
  });

  it('falls back when the model answers with the wrong types', async () => {
    stub.body = JSON.stringify({
      message: { content: '{"rooms":"two","district":"kentron"}' },
    });

    const result = await ollamaService().structured(request());

    expect(result.source).toBe('invalid');
  });

  it('accepts an answer wrapped in a code fence', async () => {
    stub.body = JSON.stringify({
      message: { content: '```json\n{"rooms":3,"district":"arabkir"}\n```' },
    });

    const result = await ollamaService().structured(request());

    expect(result.source).toBe('model');
    expect(result.value).toEqual({ rooms: 3, district: 'arabkir' });
  });

  it('gives up on a slow model rather than holding the request open', async () => {
    stub.delayMs = 600;

    const result = await ollamaService({ OLLAMA_TIMEOUT_MS: '500' }).structured(request());

    expect(result.source).toBe('error');
    expect(result.value).toEqual(FALLBACK);
  });

  it('answers an identical prompt from the cache the second time', async () => {
    const service = ollamaService({}, fakeRedis());

    const first = await service.structured(request());
    const second = await service.structured(request());

    expect(first.source).toBe('model');
    expect(second.source).toBe('cache');
    expect(second.value).toEqual(first.value);
    expect(stub.calls).toBe(1);
  });

  it('does not reuse one prompt’s answer for another', async () => {
    const service = ollamaService({}, fakeRedis());

    await service.structured(request('two rooms in Kentron'));
    const second = await service.structured(request('four rooms in Avan'));

    expect(second.source).toBe('model');
    expect(stub.calls).toBe(2);
  });

  it('does not reuse an answer across schema versions', async () => {
    const service = ollamaService({}, fakeRedis());

    await service.structured({ ...request(), schemaVersion: 1 });
    const second = await service.structured({ ...request(), schemaVersion: 2 });

    expect(second.source).toBe('model');
    expect(stub.calls).toBe(2);
  });

  it('works without a cache, at the cost of calling every time', async () => {
    const service = ollamaService({}, fakeRedis({ connected: false }));

    const first = await service.structured(request());
    const second = await service.structured(request());

    expect(first.source).toBe('model');
    expect(second.source).toBe('model');
    expect(stub.calls).toBe(2);
  });

  it('stops calling once the minute allowance is spent', async () => {
    const service = ollamaService({ LLM_REQUESTS_PER_MINUTE: '2' }, fakeRedis());

    const results = [
      await service.structured(request('a')),
      await service.structured(request('b')),
      await service.structured(request('c')),
    ];

    expect(results.map((result) => result.source)).toEqual(['model', 'model', 'quota']);
    expect(results[2]?.value).toEqual(FALLBACK);
    expect(stub.calls).toBe(2);
  });

  it('stops calling once the daily allowance is spent', async () => {
    const service = ollamaService(
      { LLM_REQUESTS_PER_MINUTE: '100', LLM_REQUESTS_PER_DAY: '1' },
      fakeRedis(),
    );

    await service.structured(request('a'));
    const second = await service.structured(request('b'));

    expect(second.source).toBe('quota');
  });

  it('lets calls through when the counters cannot be kept', async () => {
    const service = ollamaService(
      { LLM_REQUESTS_PER_MINUTE: '1' },
      fakeRedis({ connected: false }),
    );

    const first = await service.structured(request('a'));
    const second = await service.structured(request('b'));

    expect(first.source).toBe('model');
    expect(second.source).toBe('model');
  });

  it('records the prompt, the model and the answer on every path', async () => {
    const used = await ollamaService().structured(request());
    expect(used.trace).toMatchObject({
      task: 'parse-query',
      provider: 'ollama',
      source: 'model',
      system: 'Return JSON.',
      user: 'two rooms in Kentron',
    });
    expect(used.trace.at).toMatch(/^\d{4}-\d{2}-\d{2}T/u);

    const skipped = await new LlmService(
      configFor({ LLM_PROVIDER: 'rule-based' }),
      fakeRedis(),
    ).structured(request());
    expect(skipped.trace.source).toBe('no-provider');
    expect(skipped.trace.response).toBeUndefined();
  });

  it('reports which provider is in use, for a status display', async () => {
    const service = ollamaService();

    expect(service.providerName).toBe('ollama');
    expect(service.enabled).toBe(true);
    await service.structured(request());
  });
});
