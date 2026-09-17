# ADR-0019: Valuing a property that is not a listing

Status: accepted
Date: 2026-09-17

## Context

The landing page's central section asks the question the product is named for —
"should I buy this?" — about a flat the reader is standing in, which exists
nowhere in the catalogue. Everything built so far answers a narrower question:
`GET /api/listings/:id/valuation` values a row that is already in the database.

The ML service turned out to be ready for this. `/explain` takes
`ListingFeatures` and an asking price and returns the estimate, its interval, the
contributions behind it, the deviation and a verdict. Nothing about it is bound
to a listing id; only the API's own service was.

Three things the design asks for had no definition anywhere: a "risk level", a
"confidence", and a form whose fields do not cover what the model requires.

## Decision

### A quote is computed and thrown away

`POST /api/valuation/quote` stores nothing. A quote is about a property with no
identity, asked by someone who may have no account; the rows would never join to
anything, and for a reader typing their own address into a form they would be a
record of an intention they did not offer. The model version travels with every
figure instead, which is what makes a screenshot traceable months later.

### Blanks are filled from the district, and every fill is reported

The model requires a construction year, a heating type and coordinates. A reader
looking at a flat will often know none of them. Rather than make the form longer
than the design, or refuse to answer, the blanks are filled from the district's
own published stock — its median construction year, its commonest heating, its
centroid — and each substitution comes back in `assumptions` and is rendered.

The reader's own answers always win. The point is not to guess well; it is that
a reader who did not know the year their building went up can see which year was
used, because that is the figure they would want to correct.

### Unstated interior details are filled too, and this is not cosmetic

The first working version sent `null` for ceiling height, living area and
kitchen area, since the form does not ask. The result was wrong in a way that
looked right: **ceiling height came back as the second largest factor in the
quote, at −10.6% of the estimate, for a question the reader was never asked.**

A null does not describe a property whose ceiling height is unremarkable. It
describes one whose ceiling height is unknown, and the model was trained on
listings that state it, so unknown is rare and priced accordingly. Filling these
from the district's median — scaled to the property's own floor area, so the
ratio holds for a studio and a five-room flat alike — removed the artefact.

The check that this is right: the same Arabkir flat valued through the listing
endpoint, which has its real coordinates and its real interior, comes out at
֏57,184,286. Through the quote endpoint, with the district's medians standing in,
it comes out at **֏56,678,666 — 0.9% apart**.

### Confidence is a property of the interval, and says so

`confidence = 1 − (upper − lower) / estimate`, floored at zero. A range of ±10%
around the estimate scores 0.8; a range as wide as the estimate scores 0.

It is not a probability, and the panel says so in as many words. It measures the
interval and nothing else — a wide range on a well-understood property and a
wide range on an unusual one score the same. That is exactly why the comparable
count is reported beside it rather than folded into it.

### Evidence is a count, not a judgement

The design's "risk level — thin comparable data" is published as a count of
comparable listings: same district, same room count, floor area within 25%.
Below 8 the evidence is `THIN`, below 25 `MODERATE`, above that `STRONG`.

The thresholds are chosen rather than derived, and the ADR says so plainly.
There is no point in the data at which an estimate becomes trustworthy, and
inventing a formula to conceal the arbitrariness would be worse than naming it.
What matters is that a reader is told when the catalogue holds almost nothing
like their property, because that is when a confident-looking figure misleads
most.

### The notes field never reaches the model

The design's "anything else worth mentioning" is free prose. The model takes
numbers and categories, and there is no honest way to turn one into the other,
so `notes` is accepted, echoed in the reader's own form, and never mapped into a
feature. The form says this. A server-side test asserts it.

## Consequences

- The catalogue's own coverage is now visible to a reader. A district with few
  listings produces `THIN` evidence, which is true and was previously invisible.
- The quote and the listing valuation can disagree, because one has a real
  address and the other has a district centroid. They agree to within 1% on the
  case measured, but the assumption is published so the gap is explicable.
- Prices are in dram. The mockup shows dollars; the market, the model, the seed
  data and every other screen are AMD, and a currency switch is not a design
  decision to take silently.
- The form asks two things the mockup does not — year built and heating — both
  optional, because the model leans on them and a reader who knows should not be
  forced to accept a median.

## Alternatives considered

**Require every model input.** Honest, and a form nobody finishes. The whole
point of the section is a quick answer from what a viewer can see in ten
minutes.

**Refuse to answer without comparables.** Tempting for a district with two
listings, but the model still has something to say and the reader can weigh it
once the thinness is stated. Silence would be a stronger claim than the data
supports in the other direction.

**Derive confidence from the comparable count as well as the interval.** One
number combining two unrelated quantities is harder to argue with and easier to
misread. They are reported separately.
