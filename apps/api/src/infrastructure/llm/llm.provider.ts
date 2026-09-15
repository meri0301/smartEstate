/**
 * What a language model is allowed to be in this system.
 *
 * The shape of this interface encodes the project's central AI decision: a model
 * is an **enhancement to an answer the system can already produce**, never the
 * source of one. Every caller of `LlmService` has to supply a deterministic
 * fallback, and that fallback runs whenever the model is absent, slow, over its
 * quota, or returns something that does not fit the expected schema. Those are
 * not error paths; they are the default, and the model is the optimisation.
 *
 * That is also why `RULE_BASED` is a provider and not a failure mode. Choosing
 * it means the deterministic answer is the answer, and the application behaves
 * identically in every other respect, which is what lets the whole product be
 * demonstrated with no API key at all.
 */

/** Which implementation is in use. `rule-based` performs no network call. */
export const LLM_PROVIDERS = ['rule-based', 'gemini', 'ollama'] as const;
export type LlmProviderName = (typeof LLM_PROVIDERS)[number];

/**
 * The jobs a model is trusted with.
 *
 * Both are transformations of text the system already holds into text for a
 * person to read. Neither produces a fact, a number or a price; anything that
 * looks like one in the interface came from the database or the ML service.
 */
export const LLM_TASKS = ['parse-query', 'explain-ranking'] as const;
export type LlmTask = (typeof LLM_TASKS)[number];

export interface LlmRequest {
  task: LlmTask;
  /** Instructions and constraints; stable per task, so it is part of the cache key. */
  system: string;
  /** The specific input, already reduced to the facts the model may see. */
  user: string;
  temperature: number;
  maxOutputTokens: number;
}

export interface LlmCompletion {
  text: string;
  provider: LlmProviderName;
  model: string;
  latencyMs: number;
}

export interface LlmProvider {
  readonly name: LlmProviderName;
  /** Identifies the exact model, and is recorded with every response. */
  readonly model: string;
  /**
   * Whether a call is worth attempting at all: a provider with no API key
   * configured is unavailable, and saying so avoids a guaranteed failure and a
   * guaranteed wait.
   */
  available(): boolean;
  complete(request: LlmRequest): Promise<LlmCompletion>;
}

/**
 * The provider could not answer.
 *
 * Deliberately not a `DomainError`: this never reaches a client as a status
 * code, because a caller that cannot use the model uses its fallback instead.
 * It exists so the service can tell one kind of giving up from another in a log.
 */
export class LlmCallFailedError extends Error {
  constructor(
    readonly provider: LlmProviderName,
    readonly reason: string,
  ) {
    super(`${provider}: ${reason}`);
    this.name = 'LlmCallFailedError';
  }
}

/**
 * The deterministic provider: it never calls anything.
 *
 * `available()` is false, so `LlmService` goes straight to the caller's
 * fallback. Selecting this provider is how the product runs with no key.
 */
export class RuleBasedProvider implements LlmProvider {
  readonly name = 'rule-based' as const;
  readonly model = 'none';

  available(): boolean {
    return false;
  }

  complete(request: LlmRequest): Promise<LlmCompletion> {
    return Promise.reject(
      new LlmCallFailedError(
        this.name,
        `the rule-based provider does not generate text; ${request.task} must use its fallback`,
      ),
    );
  }
}
