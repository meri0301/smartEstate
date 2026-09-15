# 0011 — Ranking: transparent multi-criteria scoring, and what gets recorded

**Status:** Accepted
**Date:** 2026-09-15

## Context

The thesis's stated contribution is a comparison of ranking strategies: a transparent
multi-criteria model against a learned baseline, judged on precision@k, NDCG and explainability.
That makes the recommender's design a research instrument as much as a product feature, and it
imposes two requirements an ordinary recommender does not have.

The ranking must be **inspectable enough to argue with**. A comparison whose transparent arm
cannot actually be explained to a reader has no transparency to trade off, and the interesting
half of the result disappears.

And every run must be **recorded from the beginning**. A comparison of what users were shown
cannot be reconstructed afterwards by re-running the ranker: the catalogue moves, the valuation
model is retrained, and a re-run answers a different question.

A third constraint comes from the data. There are a few hundred synthetic listings and no real
users, so there is no implicit feedback to learn from yet. Anything that needs training data has
to wait; anything that does not should be built now.

## Decision

### 1. Seven named criteria, each one a reason a buyer would recognise

Price against budget, value against the model's estimate, size, rooms, location, condition, and
the building. Each is scored to [0, 1] with higher always better, by a curve written out in
`criteria.ts` rather than fitted, so that "this scored 0.8 on price because it is 20% under your
budget" is a claim the reader can check by hand.

Seven is a deliberate ceiling. A criterion nobody can name is a criterion nobody can argue with,
which is the failure this design exists to avoid.

### 2. The buyer's limits filter; only preferences rank

Budget, room range, minimum area and named districts are applied as SQL filters before anything is
scored. No amount of charm makes a listing over budget the right answer to "my budget is this".
Everything else is a matter of degree and is left to the criteria.

### 3. Two aggregation methods, reported side by side

Weighted sum (simple additive weighting, Fishburn 1967) and TOPSIS (Hwang and Yoon 1981) over the
same criteria matrix. They disagree in a way worth showing: a weighted sum rewards a listing that
is excellent at the one thing the buyer weighted heavily and terrible elsewhere, while TOPSIS
measures distance from the best and worst options actually available and favours the all-round
choice. Neither is correct. Reporting both, and saying when they diverge, is more useful than
picking a winner.

One honesty constraint follows. TOPSIS is a distance and does not decompose additively, so the
breakdown shown alongside a TOPSIS ranking is the weighted-sum decomposition of the same criteria:
it describes the listing's strengths, and the ordering is the method's. Presenting a distance as
though it decomposed would be precisely the opposite of what this module is for.

### 4. A criterion that cannot be measured is dropped, not defaulted

`value` needs the valuation model. When the model service is unavailable, the criterion is dropped
for the whole run, the remaining weights are renormalised so they still sum to one, and the
response names what was omitted.

The alternative, filling the gap with a neutral 0.5, would rank listings on a number nobody
produced and would do it silently. Renormalising keeps the surviving criteria in their original
proportions and keeps scores comparable across runs. A criterion missing for only some candidates
disqualifies it for all of them, because scores that are not computed the same way are not
comparable.

### 5. Weights are relative, and normalised

A profile of all fives ranks identically to a profile of all ones. This matters for the onboarding
questions: a buyer dragging every slider to the top is expressing no preference, not maximum
preference, and the model should behave that way.

### 6. Every run is stored: preferences, strategy, method, and the full ordering

`recommendation_sessions` gets the inputs, the strategy, the method, how many candidates passed
the filters, which criteria were dropped, and every returned listing with its score and breakdown.
The response carries the session id, so a later click can be attributed to the ranking that
produced it.

This is what the A/B comparison will read. It is being written before there is anything to compare,
on purpose.

### 7. The strategy is a named choice from the first request

`strategy` is on the request and on the stored session, with `LEARNED_BASELINE` already in the
enum and not yet implemented. The learned arm needs training data that does not exist yet, and
will need simulated preference profiles and a ground-truth relevance definition to be measurable
at all. Naming the slot now means adding it later changes no shapes and invalidates no stored runs.

## Consequences

- **The candidate set is capped at 100**, which is one batch to the model service. A larger
  catalogue would need either a bigger batch or a cheaper first-pass filter; both are contained
  changes behind `CANDIDATE_LIMIT`.
- **The search fetches one row more than asked for**, to detect a next page. Ranking has no pages,
  and that extra row silently pushed the first implementation one over the model's batch limit,
  costing every run its `value` criterion with no error anywhere. The candidate set is now trimmed,
  and an integration test asserts the criterion survives.
- **The location criterion is neutral when the buyer named nowhere.** Every listing then scores the
  same on it and it stops affecting the order, which is the correct behaviour for a question that
  was not asked.
- **Nothing here learns.** The criteria weights come from the buyer, not from behaviour. Implicit
  feedback is collected in `user_interactions` and is not yet used; using it is the learned arm's
  job, and doing it early would quietly make the transparent arm less transparent.
- The seed's synthetic prices mean rankings can be checked against a known generative process, the
  same advantage and the same limitation as the valuation model in ADR-0010.
