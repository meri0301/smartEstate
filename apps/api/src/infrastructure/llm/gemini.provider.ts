/**
 * Google AI Studio, free tier.
 *
 * Two constraints shape this file, both from the project's own rules. Billing is
 * never to be enabled on the Google project, so the free tier's limits are hard
 * limits rather than a cost to manage: exceeding them must degrade the feature,
 * never bill anyone. And only Flash models are used, because they are the ones
 * the free tier serves.
 *
 * A 429 is therefore not an error to retry into submission. It is the provider
 * saying the free allowance is spent, and the honest response is one short,
 * bounded back-off and then the caller's deterministic fallback.
 */
import { Logger } from '@nestjs/common';
import {
  LlmCallFailedError,
  type LlmCompletion,
  type LlmProvider,
  type LlmRequest,
} from './llm.provider.js';

export const GEMINI_API_ROOT = 'https://generativelanguage.googleapis.com/v1beta/models';

/** Attempts after a 429 or a 5xx. One retry, because the quota will not have refilled. */
const MAX_ATTEMPTS = 2;
const BASE_BACKOFF_MS = 500;

export interface GeminiOptions {
  apiKey: string;
  model: string;
  timeoutMs: number;
  /** Overridable so the provider can be pointed at a stub, or at a proxy. */
  baseUrl?: string;
}

export class GeminiProvider implements LlmProvider {
  readonly name = 'gemini' as const;
  private readonly logger = new Logger(GeminiProvider.name);

  constructor(private readonly options: GeminiOptions) {}

  get model(): string {
    return this.options.model;
  }

  available(): boolean {
    return this.options.apiKey.length > 0;
  }

  async complete(request: LlmRequest): Promise<LlmCompletion> {
    const started = Date.now();
    let lastReason = 'no attempt was made';

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      const outcome = await this.attempt(request);
      if (outcome.ok) {
        return {
          text: outcome.text,
          provider: this.name,
          model: this.options.model,
          latencyMs: Date.now() - started,
        };
      }
      lastReason = outcome.reason;
      if (!outcome.retryable || attempt === MAX_ATTEMPTS) {
        break;
      }
      // Exponential, and short: the caller has a listing page waiting.
      await sleep(BASE_BACKOFF_MS * 2 ** (attempt - 1));
    }

    throw new LlmCallFailedError(this.name, lastReason);
  }

  private async attempt(
    request: LlmRequest,
  ): Promise<{ ok: true; text: string } | { ok: false; reason: string; retryable: boolean }> {
    const url = `${this.options.baseUrl ?? GEMINI_API_ROOT}/${this.options.model}:generateContent`;
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          // The key goes in a header, never in the URL, so it cannot end up in
          // an access log or a browser history.
          'x-goog-api-key': this.options.apiKey,
        },
        signal: AbortSignal.timeout(this.options.timeoutMs),
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: request.system }] },
          contents: [{ role: 'user', parts: [{ text: request.user }] }],
          generationConfig: {
            temperature: request.temperature,
            maxOutputTokens: request.maxOutputTokens,
            responseMimeType: 'application/json',
          },
        }),
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'the request failed';
      return { ok: false, reason, retryable: true };
    }

    if (response.status === 429) {
      this.logger.warn('Gemini free-tier quota reached; falling back');
      return { ok: false, reason: 'quota exhausted (429)', retryable: true };
    }
    if (!response.ok) {
      // 4xx other than 429 means the request itself is wrong, and repeating it
      // will not help.
      return {
        ok: false,
        reason: `HTTP ${String(response.status)}`,
        retryable: response.status >= 500,
      };
    }

    const text = extractText(await response.json());
    return text === undefined
      ? { ok: false, reason: 'the response carried no text', retryable: false }
      : { ok: true, text };
  }
}

/** Pulls the first text part out of the first candidate, or nothing. */
export function extractText(body: unknown): string | undefined {
  if (typeof body !== 'object' || body === null) {
    return undefined;
  }
  const candidates = (body as { candidates?: unknown }).candidates;
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return undefined;
  }
  const parts = (candidates[0] as { content?: { parts?: unknown } }).content?.parts;
  if (!Array.isArray(parts)) {
    return undefined;
  }
  const texts = parts
    .map((part) => (part as { text?: unknown }).text)
    .filter((value): value is string => typeof value === 'string');
  return texts.length > 0 ? texts.join('') : undefined;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
