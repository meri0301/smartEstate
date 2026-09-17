# ADR-0020: Reviews, written by whoever wants to write one

Status: accepted
Date: 2026-09-17

## Context

The design's fifth section is three quotations from named people — Sarah
Jenkins, Mark Davis, Elena Rodriguez — under a badge reading "10,000+
valuations completed".

Neither part could ship as drawn. An invented endorsement attributed to a named
individual is a fabricated statement by a person who did not make it, and the
badge is contradicted by the database it sits above. Seeding them would not
help: the rest of the seed is synthetic and understood to be, but a testimonial
is a claim _about a person_, and a synthetic one reads as a real one.

So the section had to become real or not exist. It became real.

## Decision

### Anyone may write one, and it is published at once

Chosen by the product owner over the alternative of requiring an account and a
moderator's approval. It is the lowest-friction thing to demonstrate and the
highest-risk thing to run: no credential, no queue, straight to the front page.

Three things follow, and they are in the code rather than in a promise.

**Rate limited hard.** Three an hour per address. Nobody has four opinions of a
valuation tool in an afternoon, and the limit turns filling the page from a loop
into an effort. It is keyed on the address alone because there is no account on
this route by design.

**Every submission is audited.** This is the one write in the system that
anybody on the internet can reach. The log records that a review was created,
by which address, in which language, and with which role — but not its text,
which is already public and would only be duplicated into a table nobody
moderates.

**There is a way back.** `status` exists to take a review down, not to let one
up. A moderator can hide one; hiding rather than deleting keeps the record of
what was removed and by whom. Without this column, the only response to an
abusive review would be a `DELETE` that leaves no trace it was ever there.

### A name is not an identity

There is deliberately no `user_id` on the table. Nothing joins a review to an
account, so nothing in the system can drift into presenting one as verified, and
the section says as much where a reader will see it: _names are given by their
authors and are not verified by us_. The form repeats it before anything is
typed, because a person deciding what to sign should know it in advance.

The reviewer's role is a fixed enum rather than free text. The label sits beside
a name on the front page, it has to exist in three languages, and an open field
is an invitation to claim a title nobody checked.

### A review is prose, so its language is stored and marked

Machine translating a review would put words in its author's mouth. The language
it was written in is recorded instead, and the rendered quote carries `lang`, so
a screen reader pronounces an Armenian review in Armenian on the English page.

### A scroller, not a rotating banner

Every review is in the document and reachable: the track is a real horizontally
scrollable list, so it works by swipe, trackpad, keyboard, or the buttons, and a
screen reader meets all of the reviews in order. A carousel that swaps one slide
for another hides most of its content from everything except a mouse, and moves
while somebody is reading.

### The badge carries counts that can be checked

`GET /api/reviews/stats` returns published listings and stored valuations. The
figures at the time of writing are 340 and a handful — nothing like "10,000+",
and verifiable against the database by anyone who doubts them.

Standalone quotes from the landing page's calculator are deliberately not
counted: ADR-0019 does not store them, so a number including them could not be
reconciled with anything, which is the property that made the original badge
worthless.

## Consequences

- The section is empty until somebody writes the first review, and says so. That
  is a weaker first screenshot than three fabricated quotations and a stronger
  one to defend.
- Nothing is seeded. A seeded review would be a fabricated testimonial with
  extra steps.
- The open endpoint is a standing risk that the rate limit reduces and does not
  remove. If the deployment is ever public and reachable, the moderation route
  and the audit log are what the operator will need, and they exist now rather
  than after the first incident.
- A future decision to require accounts is additive: the table gains a nullable
  author id and the endpoint gains a guard. Nothing here forecloses it.

## Alternatives considered

**Moderate before publishing.** Safer, and the listing lifecycle already has the
machinery. Rejected by the product owner as too slow to demonstrate. The hide
route is the compensating control.

**Seed three illustrative reviews.** Would make the section look finished
immediately. Rejected: the whole reason the design's copy could not ship is that
invented testimonials are attributed to people, and seeding them changes nothing
about that.

**A star rating.** The design shows none, and a five-point score beside an
unverified name adds an aggregate that looks like evidence and is not.
