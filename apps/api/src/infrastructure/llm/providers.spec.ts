/**
 * The two network providers, against a stub that can misbehave on demand.
 *
 * The behaviour worth pinning down is what each one does when the free tier says
 * no: a 429 is the allowance being spent, not a transient fault, so it is
 * retried once and then given up on rather than hammered.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { extractText, GeminiProvider } from './gemini.provider.js';
import { LlmCallFailedError, RuleBasedProvider } from './llm.provider.js';
import { extractMessage, OllamaProvider } from './ollama.provider.js';

const request = {
  task: 'parse-query' as const,
  system: 'Return JSON.',
  user: 'two rooms',
  temperature: 0,
  maxOutputTokens: 64,
};

const stub = { status: 200, body: '{}', calls: 0, lastHeaders: {} as Record<string, unknown> };

describe('extractText', () => {
  it('reads the first candidate\u2019s text', () => {
    expect(extractText({ candidates: [{ content: { parts: [{ text: '{"a":1}' }] } }] })).toBe(
      '{"a":1}',
    );
  });

  it('joins parts that were split', () => {
    expect(
      extractText({ candidates: [{ content: { parts: [{ text: '{"a"' }, { text: ':1}' }] } }] }),
    ).toBe('{"a":1}');
  });

  it.each([
    [undefined],
    [null],
    ['not an object'],
    [{}],
    [{ candidates: [] }],
    [{ candidates: [{ content: {} }] }],
    [{ candidates: [{ content: { parts: [{}] } }] }],
  ])('has nothing to read in %j', (body) => {
    expect(extractText(body)).toBeUndefined();
  });
});

describe('extractMessage', () => {
  it('reads the chat message content', () => {
    expect(extractMessage({ message: { content: 'hello' } })).toBe('hello');
  });

  it.each([[undefined], [null], [{}], [{ message: {} }], [{ message: { content: '' } }]])(
    'has nothing to read in %j',
    (body) => {
      expect(extractMessage(body)).toBeUndefined();
    },
  );
});

describe('RuleBasedProvider', () => {
  const provider = new RuleBasedProvider();

  it('is never available, which is how the caller reaches its fallback', () => {
    expect(provider.available()).toBe(false);
    expect(provider.name).toBe('rule-based');
  });

  it('refuses to pretend it can generate text', async () => {
    await expect(provider.complete(request)).rejects.toBeInstanceOf(LlmCallFailedError);
  });
});

describe('the network providers', () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    server = createServer((incoming, response) => {
      stub.calls += 1;
      stub.lastHeaders = incoming.headers;
      response.writeHead(stub.status, { 'content-type': 'application/json' });
      response.end(stub.body);
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
    stub.status = 200;
    stub.calls = 0;
    stub.body = '{}';
  });

  const gemini = (apiKey = 'test-key') =>
    new GeminiProvider({ apiKey, model: 'gemini-2.0-flash', timeoutMs: 2_000, baseUrl });

  it('is unavailable without a key, so no call is wasted', () => {
    expect(gemini('').available()).toBe(false);
    expect(gemini().available()).toBe(true);
  });

  it('sends the key in a header, never in the URL', async () => {
    stub.body = JSON.stringify({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] });

    await gemini().complete(request);

    expect(stub.lastHeaders['x-goog-api-key']).toBe('test-key');
  });

  it('retries a 429 once and then gives up, rather than hammering the free tier', async () => {
    stub.status = 429;

    await expect(gemini().complete(request)).rejects.toThrow(/quota exhausted/u);
    expect(stub.calls).toBe(2);
  });

  it('does not retry a request the server called malformed', async () => {
    stub.status = 400;

    await expect(gemini().complete(request)).rejects.toThrow(/HTTP 400/u);
    expect(stub.calls).toBe(1);
  });

  it('reports a Gemini answer with no text rather than inventing one', async () => {
    stub.body = JSON.stringify({ candidates: [] });

    await expect(gemini().complete(request)).rejects.toThrow(/no text/u);
  });

  it('returns the text and names the model that produced it', async () => {
    stub.body = JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"a":1}' }] } }] });

    const completion = await gemini().complete(request);

    expect(completion.text).toBe('{"a":1}');
    expect(completion.provider).toBe('gemini');
    expect(completion.model).toBe('gemini-2.0-flash');
    expect(completion.latencyMs).toBeGreaterThanOrEqual(0);
  });

  const ollama = (url = baseUrl) =>
    new OllamaProvider({ baseUrl: url, model: 'llama3.2', timeoutMs: 2_000 });

  it('treats a configured host as available', () => {
    expect(ollama().available()).toBe(true);
    expect(ollama('').available()).toBe(false);
  });

  it('returns the message content', async () => {
    stub.body = JSON.stringify({ message: { content: '{"a":1}' } });

    const completion = await ollama().complete(request);

    expect(completion.text).toBe('{"a":1}');
    expect(completion.provider).toBe('ollama');
  });

  it('fails cleanly when Ollama is not running', async () => {
    const provider = new OllamaProvider({
      baseUrl: 'http://127.0.0.1:1',
      model: 'llama3.2',
      timeoutMs: 1_000,
    });

    await expect(provider.complete(request)).rejects.toBeInstanceOf(LlmCallFailedError);
  });
});
