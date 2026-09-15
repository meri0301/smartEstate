# 0017 — The mortgage refund: rules as data, not as code

**Status:** Accepted
**Date:** 2026-09-15

## Context

Armenia refunds the personal income tax a buyer pays, up to the mortgage interest they pay, up to a
cap, every quarter. It is a real and locally specific benefit, it is large — on the figures below,
it turns an 11% mortgage into something closer to a 1% one — and almost nobody can tell you what
they are entitled to.

It is also moving. The quarterly cap halved on 1 January 2025. The scheme has already ended for
Yerevan, ends for four more provinces in 2027 and for six in 2029, with designated border
settlements exempt. A calculator written against today's rules would be wrong within a year and
would silently stop being able to explain a mortgage signed last year.

The brief asked for this to be "a versioned rules object in the database so the rules can be
updated without redeploying", and was explicit: **do not hard-code any of these numbers.**

## Decision

### 1. A rule set is a row, and one row is the whole law at a point in time

`tax_refund_rule_sets` holds `effective_from`, `effective_to` and a JSON body carrying the minimum
agreement date, the property ceiling, the quarterly cap, the age limit and the per-province
phase-out map. Two rows are seeded by migration: one for agreements up to 2024-12-31 with the
1,500,000 ֏ cap, one from 2025-01-01 with 750,000 ֏.

Keeping the phase-out map inside the same row, rather than in a table of its own, is what makes a
row a complete and self-consistent statement rather than a fragment that has to be assembled
correctly.

### 2. Selected by the agreement date, never by today

Which cap applies is a property of the loan. A mortgage signed in 2024 keeps its 1,500,000 ֏ cap
for its whole life, and a calculation of it made in 2030 says what it said in 2024. Selecting by
the current date would make every stored answer wrong the moment the law changed, which is the
failure this whole design exists to avoid.

### 3. The rows are validated like any other untrusted input

JSON in a column is not a type. It is parsed with Zod on read and a row that does not validate
throws rather than falling back to a default — a default here would be **inventing tax law**, which
is worse than refusing to answer.

The phase-out map requires every province. An omitted one would mean "never phases out", so a
forgotten key would quietly grant a refund forever.

### 4. Two numbers this project will not invent

The brief flagged both as unverified, and both are handled by admitting it rather than by guessing.

`maxApplicantAge` is `null` in every seeded row, and null means _the condition does not exist_
rather than _the limit is unknown_. An age limit for this scheme is reported anecdotally; inventing
one would deny the refund to people entitled to it, which is the worse of the two errors.

`incomeTaxRate` is configuration — `MORTGAGE_INCOME_TAX_RATE_PCT` — **with no default**. Unset, the
calculator will not derive tax from a salary and asks for the tax paid instead. A confident figure
derived from a guessed rate is wrong by exactly as much as the guess, and looks identical to a
correct one.

### 5. The province comes from the slug, not from OpenStreetMap

`districts.marz` is free text parsed out of an OSM display name and holds values like
"Գյումրի-Ախուրյան սահման", which is a community boundary and not a province. It stays, because it
is honest about its provenance. `marz_code` is added beside it as the authoritative value, set from
the district slug in both the migration and the seed, and a town added later without an entry
throws rather than defaulting.

### 6. The answer is a structure, and a refusal is an explanation

`{ eligible, ineligibilityReasons, quarterlyRefund, totalRefundOverTerm, effectiveInterestRate,
ruleSetVersion, calculatedAt }` plus a year-by-year schedule.

Every failed condition is returned, not the first — a buyer who fixes one problem and is then told
about the next has been made to discover their ineligibility twice. Each is a code and an i18n key
with parameters, never an English sentence, because the sentence has to exist in three languages
and a string crossing this boundary would be untranslatable by the time anyone noticed.

`forgoneQuarterlyRefund` is present even when ineligible. "You get nothing" is useless; "you get
nothing because Yerevan's phase-out was 1 January 2025, and it would have been 750,000 ֏ a quarter"
is something a person can act on.

### 7. Rounding happens once, at the quarter

A refund is claimed and paid quarterly and the dram has no subunit, so the quarterly figure is the
one that is rounded and everything above it is exact integer arithmetic. Rounding the yearly
figures and the total separately put the column and its own total one dram apart over twenty years
— which is exactly the sort of detail that makes somebody stop trusting the rest of the page.

## Consequences

- **A rule change is a row, and history survives it.** The next cap change is an insert with a new
  `effective_from`; every previously quoted figure stays reproducible because its rule set is still
  there and still selected by its own agreement date.
- **The refund is larger than people expect, and the assumption behind that has to be stated.** On
  32,000,000 ֏ at 11% over 20 years with 900,000 ֏ of quarterly income tax, the calculator returns
  45.2M ֏ of 47.3M ֏ interest refunded — an effective rate of 0.64%. That is arithmetically right:
  quarterly interest starts at about 880,000 ֏ and falls below the 750,000 ֏ cap early, so most of
  it comes back. It also assumes the buyer keeps paying that much income tax every quarter for
  twenty years, which is an assumption and not a fact, and the interface says so next to the total.
- **A Yerevan mortgage signed today refunds nothing.** Most of the seed is in Yerevan, so the
  calculator would demonstrate only its refusal path without listings in Gyumri, Vanadzor and
  Dilijan. Those are seeded alongside this work for that reason.
- **The border-settlement exemption is modelled but empty.** `is_border_settlement` defaults to
  false everywhere because this project has no authoritative copy of the government list. False
  under-claims the refund rather than promising one that does not exist.
- **This is not tax advice.** Every figure is an estimate from public information, the interface
  says so in all three languages, and it points at the State Revenue Committee.
