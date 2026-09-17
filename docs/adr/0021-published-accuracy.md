# ADR-0021: The published accuracy figure comes from the model

Status: accepted
Date: 2026-09-17

## Context

The landing page's FAQ opens with "How accurate is the AI?". The design answers
it: _"Our accuracy is typically within 5-10% of the final sale price, depending
on local market volatility and data availability."_

That sentence is wrong twice.

It is wrong about **what** is predicted. The model's target is
`log_price_per_sqm_amd`, derived from asking prices. The catalogue contains no
record of what anyone paid for anything, so no claim about sale prices can be
made from it at all — and "how close to the sale price" is precisely what a
buyer means when they ask how accurate a valuation is.

It is wrong about **how close**. The model's own cross-validation puts the
typical error at 12.8% holding out listings and 24.4% holding out whole
districts — two to five times the claimed range.

Writing the true figures into the copy would have fixed today and broken later:
they change every time anything is retrained, and a number in a translation file
has no way of knowing that.

## Decision

`GET /api/valuation/model` publishes what the model measured about itself, and
the FAQ renders it.

**Two error figures, because there are two questions.** The random split holds
out individual listings, which is the everyday case: a property somewhere the
model has seen. The grouped split holds out a whole district, which asks what
happens somewhere it has never been. The second is always worse, and it is the
one that matters when someone asks whether to trust a number.

Both are shown. Reporting only the flattering one would be the same failure as
the original sentence, arrived at more carefully.

**The interval coverage is shown too** — the share of held-out properties whose
true price fell inside the range the model reported. It is the figure that says
whether the range on every estimate means anything, and it is calibrated
(80.7%) rather than raw (40.7% grouped), which the response names.

**The caveat is not a footnote.** "Against asking prices, not sale prices"
appears in the answer body, because the gap between those two is the single
thing most likely to mislead a reader of this page.

**A dead model service is not a broken page.** When the metrics cannot be
fetched, the question still has an answer — one that says the report is
unreachable and points at the range carried by every individual estimate. The
same fallback-first rule as ADR-0014.

## Consequences

- The published accuracy can never contradict the deployed model, because it is
  the deployed model's own report.
- A retrain changes the FAQ with no code change and no translation change.
- The figures on the page are worse than the design's, and correct. An examiner
  who asks where 12.8% comes from can be shown `/model`; one who asked where
  5-10% came from could not have been shown anything.
- Every other section's claims are now checkable too: this completes the sweep
  that removed "real-time market data" from the feature grid and "10,000+
  valuations" from the reviews badge.

## Alternatives considered

**Hard-code the measured figures.** Correct today. It would have gone stale
silently at the first retrain, which is the same class of defect as the stale
generated column and the stale ERD this project has already been bitten by.

**Quote only the random-split error.** 12.8% reads much better than 24.4%. It
also answers a question nobody asks: buyers do not value properties in districts
chosen to be convenient for the model.

**Say nothing numeric.** Defensible, and a retreat. The thesis is about whether
a transparent method can be trusted, and refusing to publish the number would
undercut the argument it is making.
