# 0018 — The A/B harness: experiments as data, implicit feedback as the verdict

**Status:** Accepted
**Date:** 2026-09-15

## Context

The thesis's stated contribution is a comparative evaluation of ranking strategies on precision@k,
NDCG and explainability. The recommender has logged every run since the day it existed
([ADR-0011](0011-transparent-ranking.md)) precisely so that comparison would have data. What was
missing is the other half: which strategy a person was shown, what they did about it, and the
arithmetic that turns the second into a judgement on the first.

Two facts about the project shape the design. Nobody rates listings, so relevance has to be read
from behaviour. And the second strategy the brief imagines — a learned ranker — does not exist,
because there is no training data and no ground-truth relevance yet; the harness has to be useful
without it and ready for it.

## Decision

### 1. An experiment is a row, and its arms are data

`experiments` holds a key, a description and a JSON array of arms, each naming the strategy and
method it maps to and its share of traffic, validated on read like the refund rules. Which arms ran
at what allocation is then readable from the same database that holds the results, rather than
reconstructed from whichever commit was deployed on a given day.

The harness knows nothing about what an arm _does_. It assigns, records exposures and compares
outcomes. A learned ranker, when there is one, is a third entry in the array and no change here.

### 2. Assignment is a hash, and it is sticky

The arm is `SHA-256(experiment key, subject)` mapped onto the arms by weight. Deterministic, so the
same person sees the same arm on every visit with no table of assignments to maintain; keyed on the
experiment, so being in arm A of one experiment says nothing about the next. The subject is a
signed-in user or an anonymous browser id the client minted and keeps in local storage.

Stickiness is not a nicety. A subject who saw both arms would contribute outcomes to both, and the
comparison would be partly a comparison of the same person with themselves.

Without an identifiable subject, the recommender runs as asked and records **no arm**. A random
assignment would be an experiment on nobody, and a session labelled "A" has to have been assigned
to A.

### 3. The arm is written at serving time, never derived

`recommendation_sessions.arm` could be reconstructed from the strategy and method the session
stored. It is not, because a derivation is a second definition of the arms that would drift from
the first the day an arm was redefined. The name is written when the ranking is served and stays
what it was.

Under an experiment the arm overrides the request's own strategy and method. The point of the
experiment is that the client does not pick.

### 4. Outcomes are attributed only to the session that showed the listing

`POST /interactions` records what a reader did — a view, a favourite, a comparison, a dismissal —
and takes an optional `sessionId`. The attribution is kept only if that session exists **and** its
results included that listing. Anything else is stored as a fact about the listing with no session,
so a client cannot put a thumb on the scale by attributing clicks to a ranking that never produced
them.

### 5. Relevance is implicit and graded

Nobody is asked to rate anything. A contact or a favourite counts 3, a comparison 2, a view or a
dwell 1, and a dismissal or an un-favourite 0 — including after a click, because somebody who looked
and then dismissed has said what they think. The gains are named constants and are returned in every
results payload, because they are a judgement a reader is entitled to disagree with, not a fact.

### 6. Three metrics, with the sample size beside each

Click-through rate over every session, since a session nobody acted on is a zero and leaving it out
would flatter every arm equally. Precision@k and NDCG@k (Järvelin and Kekäläinen, 2002) over
sessions with feedback, since a session with no judgement says nothing about the order and scoring
it zero would punish arms for readers who closed the tab. Each is a mean with its standard error
and its n.

### 7. No comparison below thirty sessions per arm

Arms are compared with 95% Welch intervals on the difference of means — Welch because there is no
reason to assume equal variances, an interval rather than a p-value because a decision needs to know
how large an effect might be, not only whether it might be zero. Below thirty sessions in any arm,
no comparison is returned at all. The threshold is in the payload so the page can say "not yet"
rather than imply a winner from noise.

### 8. The results are public

Aggregates with no personal data. The evaluation chapter should be reproducible by anyone with the
URL, which is not true of numbers behind a login.

## Consequences

- **The comparison that runs today is weighted sum against TOPSIS.** Both are MCDA over the same
  seven criteria and the same weights, differing only in aggregation; they disagree on real data,
  and which disagreement buyers act on is the empirical question. The brief's learned baseline is
  not an arm, and saying so is more honest than seeding one that has not been trained.
- **Nothing here fabricates traffic.** The results page shows "not enough data" until real
  sessions accumulate. A seed that simulated users would produce a results page that looked like a
  finding and was not one.
- **The recommender gained an anonymous-subject header** (`x-anonymous-id`) and records it on the
  session, so an unsigned browser is one subject rather than many.
- **Interactions are written from now on**, whether or not any experiment reads them. When a learned
  ranker is trained, its training data will already exist rather than start the day somebody
  remembers.
- **The picks page is the exposure surface.** The recommender had no interface until this ADR; the
  advisor page (ADR-0016) uses dominance, not the recommender. `/:locale/picks` calls the
  recommender under the experiment and records what the reader does with the results — and is where
  the computed explanations of ADR-0014 are finally rendered.
