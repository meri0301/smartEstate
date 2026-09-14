# 0009 — Listing lifecycle: a state machine, and ABAC layered on RBAC

**Status:** Accepted
**Date:** 2026-09-14

## Context

Anyone with an account may now offer a property, not only verified agents. That single change
brings two problems that the existing design could not express.

The first is **trust**. A listing from an unverified individual cannot appear to buyers
unreviewed, while a verified agency publishes dozens a week and cannot wait for a moderator each
time. So the same action, "create a listing", has to end in two different places depending on who
performed it, and there has to be a defined path from one place to the other.

The second is **authorisation granularity**. The API already had `RolesGuard`, which reads the
role out of the access token and decides whether the caller may reach a route. That is enough for
"only an agent may register a building". It is structurally unable to answer "may this agent edit
_this_ listing", because the answer depends on a row that has not been loaded when the guard
runs. Before this change the gap was filled by two helper functions in the listings service,
`canView` and `canEdit`, which compared `created_by_id` with the caller's id. With one more role
and five more actions, that approach spreads the same comparison across every handler and makes
it easy for two of them to disagree.

The previous status enum was also mixing two different things. `DRAFT`, `ACTIVE`, `RESERVED`,
`SOLD` and `WITHDRAWN` combined a review state with a market state, and nothing enforced any
order between them: a `PATCH` could set any value from any other.

## Decision

### 1. Status describes moderation, and only moderation

The enum becomes `DRAFT → PENDING_REVIEW → PUBLISHED → ARCHIVED`, with
`PENDING_REVIEW → REJECTED → DRAFT` as the correction loop. `RESERVED` and `SOLD` are dropped:
the platform cannot observe whether a deal happened, so a value it cannot verify would be
decoration. The migration maps `ACTIVE` and `RESERVED` to `PUBLISHED`, and `SOLD` and `WITHDRAWN`
to `ARCHIVED`. Should the product later need to record a deal, that is a separate column with its
own rules, not another value in this enum.

### 2. The machine is a table, and it is pure

`listing-lifecycle.ts` holds the transitions as data and one function that applies them. It takes
a status and an action and returns the columns that change; it performs no I/O, reads no clock and
knows nothing about HTTP or about who is asking. The whole cross product of five statuses and six
transitions is asserted in a unit test against a table written out independently of the
implementation, so a new status cannot be added without a decision being recorded for each of its
combinations.

Two transitions deserve a note. `PUBLISH` is the same edge as `APPROVE` without the queue, and
exists because a verified agent's draft goes straight to publication; who may use it is an
authorisation question, not a lifecycle one. `ARCHIVE` is legal from every live status rather than
only from `PUBLISHED`, because withdrawing a listing must not depend on where it happens to sit in
a moderator's queue.

### 3. An illegal transition is 409, not 400

The request body is well formed and would be accepted against another state of the same resource.
The conflict is with the resource, so the status code is Conflict. A rejection submitted without a
reason is different: the body itself is incomplete, so that is 422 (and 400 when the schema
catches it first). The distinction is not cosmetic, because a client retrying a 400 after fixing
the body is sensible while retrying a 409 unchanged is not.

### 4. Domain errors carry a status but do not import HTTP

`DomainError` is an abstract class with a `code`, a `status` and a free-form `context`. Domain
services throw it; a single branch in the global exception filter renders it into the shared
`ApiError` envelope. The lifecycle and the policy are therefore testable without a request, and
the response still tells the client exactly what happened: an illegal transition reports which
transitions _would_ have been legal, and an exceeded quota reports the limit and the current
count. The `ApiError` contract gained an optional `context` object for this.

### 5. Ownership is ABAC, layered on the existing RBAC guard

`listing.policy.ts` exposes one function, `can(actor, action, listing)`, returning a decision with
a reason. Roles remain the coarse filter and keep their guard; the policy adds the attributes the
guard cannot see — the owner of the row and the status it is in — and is the only place either is
consulted. The controllers no longer mention ownership at all; the service calls the policy, and
a denial becomes a 403 with a machine-readable reason.

The rules this encodes: owners edit their own content and moderators do not, because moderators
judge listings rather than rewrite them; an administrator may correct anything, but nobody edits
an archived listing; direct publication belongs to verified agents; approval and rejection belong
to staff, explicitly including a listing the moderator happens to own, because the brief asks for
moderation of _any_ pending listing; hard deletion belongs to administrators alone, since it
destroys price history that the valuation work depends on.

Visibility follows the same function, with one deliberate asymmetry: a listing the caller may not
view is reported as **404, not 403**, so the endpoint does not confirm that someone's unpublished
draft exists.

### 6. Quotas are policy data, enforced in the service

A regular account may hold three listings in `PENDING_REVIEW` or `PUBLISHED` at once, an agent
fifty, and staff are unlimited. Counting rows needs the database, which would make the policy
impure, so the policy publishes the limit and the service performs the count. The check runs on
creation and on any transition that puts a listing into a counted status, which is the only way to
stop an account from accumulating drafts and then flooding the queue.

### 7. The search status filter is narrowed server-side

`status` is a query parameter, so on its own it would let anyone enumerate other people's drafts.
The service overrides it to `PUBLISHED` for every caller who is not a moderator, unless the caller
passes `mine=true`, which instead scopes the query to their own rows and allows any status. That
gives the "my listings" screen without a second endpoint, and keeps exactly one code path that can
return a non-published row.

## Consequences

- `PATCH /listings/:id` no longer accepts `status`. Status moves only through
  `POST /listings/:id/transitions`, which takes an action and an optional reason. This is the
  behaviour change most visible to clients.
- `DELETE /listings/:id` now archives rather than withdraws, and `DELETE /listings/:id/permanent`
  is the administrator's hard delete.
- `published_at` stays non-nullable and is set when the listing becomes published. Before that it
  holds the creation time and means nothing; making it nullable would have complicated the keyset
  cursor, which sorts on it, for a field no non-staff caller can ever observe on an unpublished row.
- Seeded listings have no owner (`created_by_id` is null), so they are publishable demo data that
  only staff can act on. Demonstrating the review queue end to end needs accounts, which are
  created by registering, not by the seed.
- The `create` action is authorised against a synthetic subject owned by the caller, because there
  is no row yet. It is the one place where the policy is asked about a listing that does not exist.
