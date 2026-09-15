# 0013 — Natural-language query parsing: rules first, the model as a second opinion

**Status:** Accepted
**Date:** 2026-09-15

## Context

The brief asks that someone be able to type "two-room in Arabkir under 60 million, not ground
floor" and get the search they meant. Three languages are in scope, and two of them inflect: a
Russian or Armenian sentence names Arabkir as `Арабкире` or `Արաբկիրում`, not as the dictionary
form stored in the database.

The obvious implementation is to hand the sentence to a language model. The project's constraints
make that the wrong primary mechanism. There is no key by default, the free tier allows roughly ten
requests a minute, and [ADR-0012](0012-llm-provider-layer.md) already requires that every model
call carry a deterministic fallback. Search is the front door of the application: it cannot be the
feature that stops working when a quota is spent.

There is also an honesty problem that is independent of which mechanism parses. Any parser will
sometimes be wrong, and a wrong filter that is applied invisibly is indistinguishable, to the
reader, from an empty market. "Near a school" is a reasonable thing to type and nothing in the
system can act on it; returning results that quietly ignore it is worse than saying so.

## Decision

### 1. The deterministic parser runs on every request, and is the fallback

`QueryParserService.parse()` always runs `parseWithRules()` first, then offers its result as the
`fallback` that `LlmService.structured()` requires. With `LLM_PROVIDER=rule-based` — the default —
the rules are the entire feature, and a fresh checkout parses all three languages with no key.

The rules are not a degraded stand-in written to satisfy a signature. They are the version that
ships, so they are the version that gets the tests.

### 2. The model wins on disagreement, but only inside the schema

When a model is available it is asked the same question, given the district vocabulary in its
prompt, and its answer is validated against `parsedFiltersSchema` — the same schema the rules
produce. A model reads a sentence better than a keyword list does, so its answer is preferred. It
cannot invent a district slug, set a field outside the schema, or return a price as prose: anything
that fails validation is discarded and the rules stand, recorded as `invalid`.

### 3. The parse is shown, never applied silently

The endpoint returns filters and `unmapped`, and returns no listings at all. The client renders the
filters as removable chips and the unmapped phrases as a note, and only then runs an ordinary
search. Every filter the reader ends up searching with is one they can see and delete.

This is why the response is a reading of the request rather than a result set. Making the parse a
separate round trip costs one request and buys the reader the ability to disagree with it.

### 4. `source` distinguishes seven outcomes, not two

`model`, `cache`, `no-provider`, `quota`, `error`, `invalid`, `disabled` — carried through from the
language model layer unchanged. There is deliberately no `rules` value: anything other than `model`
or `cache` means the deterministic parser answered, and the value says why. The evaluation chapter
can then report how often a model was actually reached, and separate a spent quota from a model
that answered nonsense.

### 5. Inflection is handled by a bounded suffix match, not a morphological analyser

A token matches a district name when it equals it, or when it starts with it and is at most four
characters longer, and only for names of at least five characters written outside printable ASCII.
That covers `Արաբկիրում`, `Арабкире` and `Կենտրոնում` without pulling a stemmer for two languages
into the dependency tree, and the length floor stops a short name from matching an unrelated word.

The honest cost: it is a heuristic tuned to the case endings of two specific languages on a fixed
list of twelve districts. It would not survive being pointed at free vocabulary, and it does not
have to — the district list is closed and comes from the database.

### 6. A bound word belongs to exactly one quantity

"двухкомнатная в Кентроне до 50 млн" contains one bound word, `до`, and three numbers. Matching
rooms before price let the room count claim it, turning "two-room" into "at most two rooms" and
losing the budget entirely. Three rules together fix it: price and area are matched before rooms,
a claimed bound word is skipped by later matchers, and a scan for a bound word stops when it
reaches another number, because a word beyond one number belongs to that one.

This was invisible in short test sentences and wrong in every long one. It is the reason the parser
has 52 tests rather than a dozen.

### 7. Rate limiting lives on the endpoint

Twenty requests a minute, keyed on the account when there is one and the address otherwise. The
free tier's allowance is shared by the whole installation, so the limit exists to stop one person
spending the day's quota, not to protect the server from load.

## Consequences

- **Search works with no key, no network and no Redis**, in all three languages. That is the
  property the demonstration depends on and the thesis can claim.
- **The parser is a keyword matcher and says so.** It understands quantities, districts, building
  types, conditions and a handful of amenities. "Quiet", "near a school" and "good for a family"
  go into `unmapped`, and will stay there until the semantic search of the next feature can act on
  them.
- **The prompt is narrow on purpose.** The model is asked to extract, never to judge, rank or
  price. Those are computed elsewhere and handed to it at most as finished numbers.
- **The district vocabulary is read from the database and cached for ten minutes**, so a newly
  seeded district is searchable without a deploy, and the model's prompt lists the same slugs the
  rules match.
- **Applying a parse replaces the previous filters rather than merging with them.** A new sentence
  describes what the reader wants now; keeping a district from the last one would answer neither
  sentence. The sort order is kept, because nobody says it out loud.
- **The unmapped list is a measurement.** Logged over a demonstration session it says which
  vocabulary the deterministic parser is missing, which is a cheaper way to find the next rule than
  guessing.
