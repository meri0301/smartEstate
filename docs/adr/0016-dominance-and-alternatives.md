# 0016 — The "better option" engine: Pareto dominance with indifference thresholds

**Status:** Accepted
**Date:** 2026-09-15

## Context

The brief calls this the core page: "given a listing the user is looking at, find alternatives that
dominate it (cheaper or larger or better located for similar money) and explain the trade-off of
each."

The recommender already ranks listings against what a buyer said they wanted, and it needs weights
to do it — a buyer has to be asked how much price matters against size. This is a different
question and a stronger one. "Is there a flat that is better than this one in every respect?" can
be answered without asking anybody anything, and an answer to it is worth more than a ranking
precisely because no weighting had to be invented to produce it.

The risk is that the page becomes yet another "similar properties" strip. Every classifieds site
has one, nobody reads it, and it is filled by similarity rather than by any claim about quality.

## Decision

### 1. Pareto dominance, stated plainly

An alternative dominates the listing being viewed when it is at least as good on every criterion
compared and better on at least one. Nothing is weighted, nothing is summed, and the relation is
the same one an examiner will recognise from multi-objective optimisation.

Everything else that is better on something is a **trade-off**, reported with what it costs. A
candidate that is better on nothing is dropped: there is no sentence to write about it that a buyer
would want to read.

### 2. Indifference thresholds, or dominance never happens

Two prices are never exactly equal, so a naive comparison finds a winner on every criterion and
dominance nowhere. Each criterion therefore has a difference below which the two listings are
treated as the same: 2% of the price, 2 m², 200 m, a tenth of the condition and building scales.
A criterion with such a threshold is a pseudo-criterion rather than a true one, which is the
vocabulary of outranking methods (Roy, 1991) and the same family the recommender's TOPSIS comes
from.

The thresholds are set to what a buyer would notice and are named constants, because a reader is
entitled to disagree with them and the whole page's output moves when they change.

### 3. Rooms and district filter; they do not score

More rooms is not better — a one-room buyer does not want four — and a different district is a
matter of taste, not quality. Both decide _which_ listings are comparable rather than _how good_
they are: a candidate is in the same district, has at least as many rooms, and costs no more than
110% of the subject. That last figure is the brief's "similar money", set so the page never answers
"spend more" to somebody who did not ask.

### 4. Droppable criteria, said out loud

`location` needs a place the buyer named and `value` needs the model service. When either is
missing it leaves the comparison entirely rather than being defaulted, and `omittedCriteria` says
so. Dominance established over five criteria is a weaker statement than the same result over seven,
and the response has to let a reader tell the difference. This is the same rule the recommender
applies to `value`, and it is now the house style for a measurement that cannot be taken.

### 5. Every comparison carries both numbers

Each criterion reports the subject's value, the alternative's value, the unit, and which way it
went. A claim that one flat is better than another is checkable by arithmetic a reader can do in
their head, which is the property the transparent-ranking decision (ADR-0011) bought for the
recommender and this keeps for the advisor.

### 6. Nothing is a real answer

A listing with no better option is a good buy, and saying so is useful. The page does not pad
itself with near-misses to avoid an empty state.

## Consequences

- **Dominance is rare, and that is the point.** Measured over the 21 two-room flats in Kentron:
  3 have at least one strictly better alternative, 17 have only trade-offs, and 1 has nothing
  better at all. A mechanism that fired on every listing would be describing similarity, not
  superiority.
- **The trade-offs carry most of the value.** A typical result is "better on five, worse on one",
  and naming the one is what makes the other five trustworthy.
- **The comparison reuses the recommender's `conditionScore` and `buildingScore`.** One definition
  of "a better building" across the product; a second would eventually disagree with the first. If
  a third consumer appears they should move somewhere shared rather than be copied again.
- **A dominance claim depends on the candidate filter.** Nothing outside the same district and room
  count is ever considered, so "no better option" means "none among the listings you could switch
  to", not "none in Armenia". The response reports `candidateCount` so the scope of the claim is
  visible.
- **The floor criterion is deliberately blunt.** Ground floor, top floor without a lift, everything
  else. Preferring the fourth floor to the fifth is taste, and taste has no place in a claim that
  something is objectively better.
- **The anchor is two flat query parameters**, refined together, because a query string has no
  nesting and a private bracket convention for one endpoint would be a dialect nobody else in the
  API speaks.
