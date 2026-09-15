# 0014 — Recommendation explanations: computed reasons, and a checked paragraph

**Status:** Accepted
**Date:** 2026-09-15

## Context

The brief asks for "one honest paragraph per listing", generated from the score breakdown, in the
buyer's language, and it is explicit about how: "Feed it only the computed numbers so it cannot
invent facts. Never let the model generate prices or attributes." Section F.4 makes the same point
as a rule — no model output is ever trusted as fact, and every number in the interface comes from
the database or the model service.

Three constraints bear on how to satisfy that.

The free tier allows roughly ten requests a minute. A page of ten ranked listings, explained one
call at a time, would spend a whole minute's allowance on a single ranking.

The default provider is `rule-based`, which reaches no model at all. Whatever "explanation" means
here, it has to mean something on a fresh checkout with no key.

And the application already formats every number in the reader's locale, in the browser, with
`Intl`. A paragraph assembled on the server would either duplicate that work badly or hand the
client a string it cannot reformat.

The tempting design — ask a model to explain each listing, show what it says — fails all three.

## Decision

### 1. The explanation is computed; the paragraph is phrasing

`explain()` turns the criterion breakdown into up to four `highlights`: the criteria that placed
the listing where it is, each marked a strength or a trade-off, each carrying the figure behind it
as a number with a named key (`budgetHeadroomPct`, `priceVsEstimatePct`, `areaSqm`, `rooms`,
`distanceM`, `buildingAgeYears`). That is the explanation. It is always present, it is derived from
the same arithmetic that produced the score, and a client renders a complete answer to "why this
one?" from it in any of the three languages.

`text` is the same facts phrased as a paragraph by a language model. It is absent by default, and
nothing is lost when it is missing. Prose is fluency, not information.

Keeping the figures as numbers rather than sentences is what lets the browser format them — a
figure crossing the wire as "45 000 000 ֏" could not be re-rendered for a Russian or English
reader, and hand-rolling Armenian number formatting on the server would undo Phase 6's work.

### 2. Trade-offs are named as readily as strengths

A criterion at or above 0.7 is a strength, at or below 0.35 a trade-off, and the ordinary middle
explains nothing and is left unsaid. Strengths are listed first, because a trade-off read first is
read as a rejection — but they are listed. A recommender that only gives reasons to say yes is an
advertisement, and a buyer surprised later was misled now.

A criterion carrying less than 0.05 of the weight is never given as a reason, however well it
scored. With no weight behind it, it is not why the listing is anywhere.

### 3. One model call per page

Every listing on the page goes into a single prompt and the model answers for all of them at once.
Ten calls per ranking against a ten-a-minute allowance is not a rate limit problem to be tuned; it
is a design that does not fit its budget. Only the top ten results are given prose, which also
bounds a prompt that a `limit` of 50 would otherwise let grow without a ceiling.

### 4. The model is given figures, never the listing

The prompt contains a rank, a price, an area, a room count and the criteria that decided the
position. Not the title, not the description, not the address, not the photographs. There is
nothing in it to embellish, which is a stronger guarantee than asking a model not to embellish.

### 5. Every paragraph is checked against the figures it was given

This is the part that makes F.4's first rule a rule rather than a request. `ungroundedNumbers()`
extracts every number from the generated text and matches it against the figures for that listing.
A paragraph containing one that cannot be accounted for is discarded and the computed reasons stand
alone.

The matching is deliberately generous about form and strict about value. It reads the separator
conventions of all three locales (45,000,000 and 45 000 000 and 45.000.000), accepts a figure
written at thousand or million scale ("45 million"), and tolerates rounding to the precision the
number was actually written to — "about 20%" satisfies 20.4%, while "a full 25%" does not.

The check is per listing. A model that hallucinates on the fourth result does not cost the other
nine their prose.

Its honest limit: it reads digits. "Three bathrooms" spelled out in words passes a test that only
looks at numbers, and the prompt and review are what stand between that and a reader. The check is
still worth having, because the numbers are where a wrong answer does damage — a wrong price is a
wasted viewing, a wrong adjective is a shrug.

### 6. Rate limiting moved to `common`

`POST /recommendations` may now reach a model, so it draws on the same twenty-a-minute per-user
allowance as query parsing. The limit moved from the search module into `common/rate-limit`,
because every AI endpoint spends from one shared free tier: a limit each feature set for itself
would add up to no limit at all.

### 7. The trace is stored only when a model was reached

`RecommendationSession.llmTrace` already existed for exactly this. It is written when the source is
`model`, `cache`, `invalid` or `error` — every case where a call actually happened, including the
two where it went wrong, which are the ones somebody will want to read back. It is null for
`no-provider`, `quota` and `disabled`: a prompt that was never sent is not evidence of anything,
and storing one on every run would put a few kilobytes of unsent prompt on every row in the table
the evaluation chapter reads from.

The source itself is recorded with the run's inputs, so the evaluation can say how many stored
rankings a model ever spoke about without opening the traces.

## Consequences

- **The feature is complete with no key**, and `explanationSource` says why the prose is missing.
  `rule-based` is not a degraded mode: it is the default, and the reasons are the same reasons.
- **A model can only change words, never numbers.** ADR-0012 stated that as a rule the prompts and
  review had to keep. For this feature it is now enforced after the fact as well.
- **`explain: false`** turns the model off per request, for batching, benchmarking or an A/B run
  that should not spend quota on wording.
- **The web rendering lands with Phase 9.** The advisor page is where ranked listings are shown,
  and it will compose sentences from the highlights with ICU messages, exactly as the rest of the
  application composes user-facing text. The API being ahead of the page is deliberate: the shape
  it returns is what the page will need.
- **Integration tests run without Redis.** The setup file pinned everything else about the
  environment already and had left `REDIS_URL` inherited, which meant a second identical request
  could be answered from a previous test's cached value. The caching is tested where it lives,
  against a fake.
- **The grounding check has a false-rejection cost.** A correct paragraph that rounds unusually, or
  writes a figure in a form the reader was not given, loses its prose. That direction of failure is
  the right one: the reader still gets the computed reasons, and the alternative direction is a
  confidently wrong number in front of somebody making the largest purchase of their life.
