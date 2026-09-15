# 0012 — The language model layer: a fallback-first interface

**Status:** Accepted
**Date:** 2026-09-15

## Context

Two features want a language model: turning a free-text search into a structured filter, and
turning a score breakdown into a readable paragraph. The project's constraints make that awkward
in a useful way.

There is no Anthropic key, and billing is never to be enabled on the Google project that would
provide one, so the only available model is a free tier with roughly ten requests a minute and a
few hundred a day. The application must be fully demonstrable with no key at all, on an examiner's
machine, on a train. And the brief's own guardrails say no model output is ever trusted as fact,
that a model being down must degrade to ordinary search rather than a blank page, and that every
prompt, model version and response is logged for reproducibility.

The usual way to satisfy those requirements is a convention: call the model, catch the error, do
something sensible. Conventions are not enforced, and the failure mode is silent and late.

## Decision

### 1. The fallback is a required argument

`LlmService.structured()` takes a Zod schema and a `fallback: () => T`, and returns `T`. It has no
throwing path. A caller cannot ask for a model answer without first having written the answer the
system would give without one.

This turns the brief's guardrail from a rule into a signature. A reviewer establishes that the
model is not load-bearing by reading the types, not by auditing every call site, and a new feature
cannot forget.

The consequence to accept is that the deterministic implementation is written first and always.
That is more work, and it is the work that makes the product demonstrable without a key.

### 2. `rule-based` is a provider, not a failure

Selecting it reports `available() === false`, so every call goes straight to the fallback. It is
the default. A fresh checkout with no environment file runs every AI feature, deterministically,
and the only difference a key makes is the wording of some sentences.

### 3. Six outcomes, each recorded separately

`model`, `cache`, `no-provider`, `quota`, `error`, `invalid`, `disabled`. Collapsing them into
"worked" and "did not" would throw away the measurement the evaluation chapter wants: how often the
model was actually reached, and why it was not.

`invalid` is the interesting one. A model that answers with prose, or with a string where a number
was asked for, has not partly succeeded; it has failed in a way that would be dangerous to
interpret charitably. The schema check is the boundary, and anything that does not cross it is
treated exactly like a refused connection.

### 4. The free tier's limits are enforced on our side

Minute and day allowances are counted in Redis, shared across API processes, and checked before
each call. The provider's own 429 is handled too, with a single short back-off, because a quota
does not refill in a second and retrying into it is just a slower failure.

Enforcing the limit locally is not about politeness. Billing is disabled on that project, so the
practical question is whether exceeding the free tier degrades a feature or breaks it; degrading on
our terms is better than discovering the provider's.

### 5. Redis is optional, and a missing cache never refuses work

Without Redis the layer runs uncached and the quota counters return nothing. A counter that cannot
be kept lets the call through: declining to work because a cache is down would be a worse failure
than briefly exceeding a soft limit, and the provider's 429 is still the real boundary.

### 6. Prompts are cached by a hash of everything that could change the answer

Provider, model, task, schema version, system prompt and user prompt. The provider and model are in
the key because two models answer the same prompt differently and an answer from one must not be
attributed to the other. `schemaVersion` lets a caller invalidate its own cached answers when the
meaning of its schema changes.

### 7. Traces are logged and returned, not stored in a table of their own

Every invocation is logged with its prompt, model and raw response. The trace is also returned to
the caller, so a feature that owns a record, such as a recommendation session, can persist it
alongside the thing it explains. No new table: the schema already has a home for the one case that
needs durable traces, and inventing a second would split the record.

## Consequences

- **Every AI feature is written twice**, once deterministically and once as a prompt. The
  deterministic version is the one that ships by default.
- **A model can only change words, never numbers.** Prices, scores and estimates come from the
  database or the ML service; the model is given the computed figures and asked to phrase them.
  Nothing in the layer would stop a careless caller from asking a model to do arithmetic, so that
  rule lives in the prompts and in review.
- **The model name follows the provider** when none is set, because a single default would hand
  Ollama a Gemini model name. A test caught exactly that.
- **`GeminiProvider` takes an overridable base URL**, which is how it is tested against a stub and
  would be how it is put behind a proxy.
- Rate limiting per user, which the brief also asks for, is not in this layer: it belongs on the
  endpoints that expose AI features, and lands with the first of them.
- Nothing calls this layer yet. It is deliberately built before its consumers so that the first
  feature to need a model inherits the guardrails rather than negotiating them.
