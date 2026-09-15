# 0015 — Hybrid search: local embeddings, full text, and reciprocal rank fusion

**Status:** Accepted
**Date:** 2026-09-15

## Context

The deterministic query parser ([ADR-0013](0013-natural-language-query-parsing.md)) turns the
exact part of a sentence into filters and reports the rest as `unmapped`. Running it against the
seeded catalogue, the unmapped list is consistently the same kind of thing: _quiet_, _bright_,
_near a school_, _green courtyard_, _somewhere to raise a family_. Those are reasonable things to
want and no `WHERE` clause expresses any of them. They are also, without exception, things the
listing descriptions actually talk about.

So the words are in the data and the filters cannot reach them. Two mechanisms can: full-text
search, which matches the words themselves, and vector search, which matches what they mean. They
fail in opposite directions — full-text misses a description that says "далеко от шума" when the
query said "quiet", and vector search will happily return something that is merely _about_
apartments when an exact term was wanted — which is the standard argument for running both.

The constraints from Phase 0 are that no external embedding API may be called, the model runs
locally in `apps/ml`, its version is pinned and recorded with every stored vector, and the whole
product starts with `docker compose up` on an examiner's machine.

## Decision

### 1. `multilingual-e5-small`, pinned by commit hash

118M parameters and about 470 MB of weights, against 1.1 GB for `e5-base` and 1.8 GB for LaBSE.
It is trained for retrieval rather than for sentence similarity in general, and its XLM-RoBERTa
vocabulary covers Armenian and Russian. Even so, torch takes the runtime image to about 2.9 GB,
which is the real price of this feature and is written down here so nobody is surprised by it.

The dimension therefore drops from 768 to 384 — a migration, as the schema comment had always
said a model change would be. The weights are baked into the runtime image at a pinned revision, so
the container starts with no network and two images of the same tag embed identically.

Measured on the real model, a Russian query matched an Armenian passage at 0.878 cosine against
0.923 for the same-language passage, and both beat every "noisy street next to nightclubs" passage
for all three query languages. Cross-lingual retrieval works; one vector per listing is enough, and
there is no need for a row per language.

### 2. Only the prose is embedded

Rooms, area, district, building type and condition are not in the vector, although folding them in
would be easy. They are already exact filters. Putting them in the vector as well would let a fuzzy
match argue with an exact constraint, and sometimes win. The vector carries the description, which
is the part no filter can express.

### 3. Both arms search inside the filters

The filters are applied by the same `buildFilters` the ordinary listing search uses, in both arms.
Duplicating those predicates is how "under 60 million" comes to mean one thing in the filter panel
and another in the search box, and that is a bug nobody can see. A listing over budget is not a
worse answer, it is not an answer.

### 4. Fusion by rank, not by score

The two arms produce numbers that cannot be added. `ts_rank` is small, unbounded above and
meaningful only within one query. Cosine similarity on this encoder compresses almost everything
into 0.75–0.95: in the measurement above, the gap between a good match and an actively wrong one
was about a fiftieth of the nominal range. Normalising per query would let whichever arm happened
to have the wider spread decide the result.

Reciprocal rank fusion (Cormack, Clarke and Buettcher, SIGIR 2009) throws the scores away and keeps
the order:

    score(d) = Σ over arms of 1 / (k + rank(d))

at k = 60, the paper's value and the baseline every later comparison uses. A listing both arms rank
highly wins; a listing only one arm found can still place, which is the entire point of running
two. The response publishes `rrfK` and each arm's rank per result, so a ranking can be recomputed
by hand and a stored one stays interpretable if k ever changes.

### 5. The lexical arm asks a disjunction

`websearch_to_tsquery` combines bare words with AND. For a search box people type two words into
that is right; for a sentence it is fatal, and silently so. "Quiet bright flat near a school in
Arabkir under 60 million" as an AND query asks for a listing containing all eleven words, and the
arm returned nothing for every real query — the hybrid search had quietly become a semantic search
with extra steps, and every test still passed.

The terms are therefore joined with OR and `ts_rank` decides the order, which is what a rank
function is for: it already rewards a document matching more of the terms, and rarer ones. The
terms still go through `websearch_to_tsquery` rather than `to_tsquery`, because turning a person's
prose into a query language is how injection gets written by accident.

### 6. The semantic arm is optional and says when it is absent

Without a model service, without an encoder, or before the first backfill, the search runs
lexically and the response carries `semanticSkipped` with the reason. `not-indexed` is the one an
operator can fix. The index is checked before the encoder is called, so a search of an empty index
costs no model time.

### 7. A backfill command, not an endpoint

Embedding the catalogue is an operator's decision with a real cost in time. It boots the
application context, so it uses the same configuration, client and service the API uses — a
backfill that built text differently from the running product would produce an index that quietly
disagrees with it. Listings embed themselves when they are published; the command is for the first
run, a model change and a reseed.

It skips a listing whose text hash and model version both match, so a second run over an untouched
catalogue does no encoding at all. It asks for the model version uncached, because it decides from
that answer which rows to delete, and acting on a five-minute-old version could delete the current
rows and keep the stale ones. A test caught exactly that.

### 8. Armenian has no stemmer

The generated `tsvector` picks its configuration by locale: `russian`, `english`, and `simple` for
Armenian, which PostgreSQL has no dictionary for. Armenian lexical search therefore matches word
forms rather than lemmas, and `Արաբկիրում` does not lexically match `Արաբկիր`. The semantic arm
covers a good deal of that, and the district vocabulary in the parser covers the rest for the words
that matter most. It is a real limitation of the lexical half and not a bug to be found later.

## Consequences

- **The runtime image is about 2.9 GB**, nearly all of it torch, and the ML container now takes
  roughly half a minute to start while the encoder loads. The health check's grace period was
  raised to match, and CI's compose job is slower by the time it takes to build that image.
- **A search costs one model call** when the index is populated, drawn from the same twenty-a-minute
  per-user AI allowance as the other model-backed endpoints.
- **Hybrid search returns a ranked list, not a page.** Fusion reorders a fixed pool from each arm,
  so there is no stable key to page by; `limit` is capped at 50 and there is no cursor.
- **`ARM_DEPTH` is the real recall ceiling.** Fusion can only reorder what it is given, so nothing
  below the fiftieth result of both arms can ever be returned.
- **Changing the model means re-embedding everything.** The backfill does it, and deletes the old
  vectors first: a partial index of current vectors searches correctly on less data, while a mixed
  index searches incorrectly on more and says nothing about it.
- **The integration tests use a stub encoder** — a hash spread over 384 dimensions — so CI needs no
  weights. What a stub cannot show is that the results are sensible; that was measured against the
  real model and is recorded in this document instead.
