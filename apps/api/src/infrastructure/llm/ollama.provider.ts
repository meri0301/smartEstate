/**
 * A model running on the developer's own machine, through Ollama.
 *
 * The reason this provider exists is that it has no quota, no key and no terms
 * of service, so the AI features can be developed and demonstrated without
 * depending on anyone's free tier. It is slower, which is why its timeout is
 * configured separately rather than sharing the remote one.
 *
 * Ollama is not assumed to be installed. `available()` reports true when a host
 * is configured, and a refused connection degrades exactly like any other
 * provider failure: the caller uses its deterministic answer.
 */
import {
  LlmCallFailedError,
  type LlmCompletion,
  type LlmProvider,
  type LlmRequest,
} from './llm.provider.js';

export interface OllamaOptions {
  baseUrl: string;
  model: string;
  timeoutMs: number;
}

export class OllamaProvider implements LlmProvider {
  readonly name = 'ollama' as const;

  constructor(private readonly options: OllamaOptions) {}

  get model(): string {
    return this.options.model;
  }

  available(): boolean {
    return this.options.baseUrl.length > 0;
  }

  async complete(request: LlmRequest): Promise<LlmCompletion> {
    const started = Date.now();
    let response: Response;
    try {
      response = await fetch(`${this.options.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        signal: AbortSignal.timeout(this.options.timeoutMs),
        body: JSON.stringify({
          model: this.options.model,
          stream: false,
          // Ollama honours this for models that support structured output and
          // ignores it otherwise; either way the caller validates the result.
          format: 'json',
          options: {
            temperature: request.temperature,
            num_predict: request.maxOutputTokens,
          },
          messages: [
            { role: 'system', content: request.system },
            { role: 'user', content: request.user },
          ],
        }),
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'the request failed';
      throw new LlmCallFailedError(this.name, reason);
    }

    if (!response.ok) {
      throw new LlmCallFailedError(this.name, `HTTP ${String(response.status)}`);
    }

    const text = extractMessage(await response.json());
    if (text === undefined) {
      throw new LlmCallFailedError(this.name, 'the response carried no message');
    }
    return {
      text,
      provider: this.name,
      model: this.options.model,
      latencyMs: Date.now() - started,
    };
  }
}

/** Ollama's chat endpoint answers with `{ message: { content } }`. */
export function extractMessage(body: unknown): string | undefined {
  if (typeof body !== 'object' || body === null) {
    return undefined;
  }
  const content = (body as { message?: { content?: unknown } }).message?.content;
  return typeof content === 'string' && content.length > 0 ? content : undefined;
}
