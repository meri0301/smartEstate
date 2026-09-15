/**
 * The whole chain, with a model at the end of it.
 *
 * The other recommendation tests run the default provider, where no model is
 * reached and the computed reasons are the whole explanation. This file runs a
 * stub that answers like Ollama, so the prompt, the call, the parsing, the
 * grounding check and the merge back onto the right listing are all real. It is
 * the only place that proves a paragraph can actually arrive — and the only
 * place that proves an invented one cannot.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { RecommendationResponse } from '@smartestate/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startTestApp, type TestApp } from './setup/test-app.js';

const BUDGET = 60_000_000;

/** What the stub model will say next, how it will fail, and what it was asked. */
const model: {
  reply: (prompt: string) => string;
  status: number;
  prompts: string[];
} = {
  reply: () => JSON.stringify({ explanations: [] }),
  status: 200,
  prompts: [],
};

/** Every listing id the model was told about, in the order they appeared. */
function listingIdsInPrompt(): string[] {
  const prompt = model.prompts.at(-1) ?? '';
  return [...prompt.matchAll(/listingId: (\S+)/gu)].map((match) => match[1] ?? '');
}

function startModelStub(): Promise<{ server: Server; baseUrl: string }> {
  const server = createServer((request, response) => {
    let body = '';
    request.on('data', (chunk: Buffer) => (body += chunk.toString()));
    request.on('end', () => {
      const parsed = JSON.parse(body) as { messages: { role: string; content: string }[] };
      const user = parsed.messages.find((message) => message.role === 'user')?.content ?? '';
      model.prompts.push(user);
      if (model.status !== 200) {
        response.writeHead(model.status, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ error: 'the model is unavailable' }));
        return;
      }
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ message: { content: model.reply(user) } }));
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({ server, baseUrl: `http://127.0.0.1:${String(port)}` });
    });
  });
}

/** Values the model service has no part in here; ranking only needs it to be absent. */
function startDeadValuationStub(): Promise<{ server: Server; baseUrl: string }> {
  const server = createServer((_request, response) => {
    response.writeHead(503, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ detail: 'No valuation model is loaded.' }));
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({ server, baseUrl: `http://127.0.0.1:${String(port)}` });
    });
  });
}

describe('explanations with a model behind them', () => {
  let app: TestApp;
  let modelServer: Server;
  let valuationServer: Server;

  const recommend = async (limit = 3): Promise<RecommendationResponse> => {
    const response = await app.request('POST', '/api/recommendations?locale=en', {
      body: { preferences: { budgetAmd: BUDGET, roomsMin: 2, roomsMax: 3 }, limit },
    });
    expect(response.statusCode).toBe(200);
    return response.json<RecommendationResponse>();
  };

  beforeAll(async () => {
    const stub = await startModelStub();
    const valuation = await startDeadValuationStub();
    modelServer = stub.server;
    valuationServer = valuation.server;
    app = await startTestApp({
      ML_BASE_URL: valuation.baseUrl,
      LLM_PROVIDER: 'ollama',
      OLLAMA_BASE_URL: stub.baseUrl,
      LLM_MODEL: 'stub-model',
    });
  });

  afterAll(async () => {
    await app.close();
    await Promise.all(
      [modelServer, valuationServer].map(
        (server) =>
          new Promise<void>((resolve) => {
            server.close(() => {
              resolve();
            });
          }),
      ),
    );
  });

  beforeEach(() => {
    model.prompts = [];
    model.status = 200;
    model.reply = () => JSON.stringify({ explanations: [] });
  });

  it('attaches a grounded paragraph to the listing it is about', async () => {
    model.reply = (prompt) => {
      const ids = [...prompt.matchAll(/listingId: (\S+)/gu)].map((match) => match[1] ?? '');
      return JSON.stringify({
        explanations: ids.map((id, index) => ({
          listingId: id,
          text: `Ranked ${String(index + 1)} on the criteria shown.`,
        })),
      });
    };

    const result = await recommend();

    expect(result.explanationSource).toBe('model');
    for (const item of result.items) {
      expect(item.explanation.text).toBe(`Ranked ${String(item.rank)} on the criteria shown.`);
    }
  });

  it('refuses a paragraph that quotes a price nobody computed', async () => {
    model.reply = (prompt) => {
      const [first] = [...prompt.matchAll(/listingId: (\S+)/gu)].map((match) => match[1] ?? '');
      return JSON.stringify({
        explanations: [
          {
            listingId: first,
            text: 'An absolute steal at 12,345,678 ֏ — well below anything else.',
          },
        ],
      });
    };

    const result = await recommend();

    // The model answered, so the run reports that it did; the paragraph is still
    // gone, and the computed reasons are what the reader gets.
    expect(result.explanationSource).toBe('model');
    expect(result.items[0]?.explanation.text).toBeUndefined();
    expect(result.items[0]?.explanation.highlights.length).toBeGreaterThan(0);
  });

  it('keeps the paragraphs that check out when one of them does not', async () => {
    model.reply = (prompt) => {
      const ids = [...prompt.matchAll(/listingId: (\S+)/gu)].map((match) => match[1] ?? '');
      return JSON.stringify({
        explanations: ids.map((id, index) => ({
          listingId: id,
          text: index === 1 ? 'Six minutes from 3 metro stations.' : 'A reasonable compromise.',
        })),
      });
    };

    const result = await recommend();

    expect(result.items[0]?.explanation.text).toBe('A reasonable compromise.');
    expect(result.items[1]?.explanation.text).toBeUndefined();
    expect(result.items[2]?.explanation.text).toBe('A reasonable compromise.');
  });

  it('falls back to the computed reasons when the model answers with prose', async () => {
    model.reply = () => 'Certainly! Here are my thoughts on these lovely apartments.';

    const result = await recommend();

    expect(result.explanationSource).toBe('invalid');
    expect(result.items.every((item) => item.explanation.text === undefined)).toBe(true);
    expect(result.items[0]?.explanation.highlights.length).toBeGreaterThan(0);
  });

  it('falls back when the model refuses the call, and still ranks', async () => {
    model.status = 503;

    const result = await recommend();

    expect(result.explanationSource).toBe('error');
    expect(result.items).toHaveLength(3);
  });

  it('asks once for the page, whatever its length', async () => {
    await recommend(8);

    expect(model.prompts).toHaveLength(1);
    expect(listingIdsInPrompt()).toHaveLength(8);
  });

  it('tells the model figures and reasons, never the listing text', async () => {
    await recommend(1);
    const prompt = model.prompts[0] ?? '';

    expect(prompt).toMatch(/price: \d+ AMD/u);
    expect(prompt).toMatch(/reasons:/u);
    // Nothing a model could embellish: no title, no address, no description.
    expect(prompt).not.toMatch(/title|address|description/iu);
  });

  it('stores the prompt and the response beside the ranking they explain', async () => {
    model.reply = (prompt) => {
      const [first] = [...prompt.matchAll(/listingId: (\S+)/gu)].map((match) => match[1] ?? '');
      return JSON.stringify({
        explanations: [{ listingId: first, text: 'Solid on the criteria that matter to you.' }],
      });
    };

    const result = await recommend(1);
    const session = await app
      .prisma()
      .recommendationSession.findUnique({ where: { id: result.sessionId } });

    const trace = session?.llmTrace as {
      task: string;
      model: string;
      source: string;
      system: string;
      user: string;
      response: string;
    };
    expect(trace.task).toBe('explain-ranking');
    expect(trace.model).toBe('stub-model');
    expect(trace.source).toBe('model');
    expect(trace.user).toContain('listingId:');
    expect(trace.response).toContain('Solid on the criteria');
  });
});
