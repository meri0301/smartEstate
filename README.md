# SmartEstate

AI-assisted apartment search and buying advisor for the Armenian real-estate market.
University thesis project. The full brief, domain model and phase plan live in
[docs/BUILD_PROMPT.md](docs/BUILD_PROMPT.md); architectural decisions are recorded in
[docs/adr](docs/adr/README.md).

## Stack at a glance

| Layer     | Technology                                                           |
| --------- | -------------------------------------------------------------------- |
| API       | NestJS 12 (Fastify adapter), TypeScript 6.0, Prisma (Phase 1)        |
| Web       | React 19, Vite 8, TypeScript 6.0, Feature-Sliced Design              |
| ML        | Python 3.12, FastAPI, scikit-learn / LightGBM (Phase 7)              |
| Data      | PostgreSQL 16 + PostGIS 3.6 + pgvector 0.8, Redis 7                  |
| Contracts | `@smartestate/contracts` — Zod schemas shared by API and web         |
| Tooling   | pnpm 9 workspaces, Turborepo, ESLint 10, Prettier, Husky, commitlint |
| CI        | GitHub Actions: lint · typecheck · test · build · compose smoke test |

## Prerequisites

| Tool                    | Version     | Notes                                                    |
| ----------------------- | ----------- | -------------------------------------------------------- |
| Node.js                 | 24.x (LTS)  | Pinned in `.nvmrc`; other majors are rejected on install |
| pnpm                    | 9.15.x      | `corepack enable` **or** `npm i -g pnpm@9.15.9`          |
| Docker + Compose plugin | Docker ≥ 24 | Docker Desktop on Windows/macOS                          |
| Git                     | any recent  |                                                          |

Python is **not** required locally; the ML service runs and tests inside Docker.

> **Windows note.** `corepack enable` needs an elevated shell because it writes to
> `C:\Program Files\nodejs`. The `npm i -g pnpm@9.15.9` route works without elevation.

## Quick start

```bash
git clone https://github.com/meri0301/smartEstate.git
cd smartEstate
cp .env.example .env
pnpm install
pnpm docker:up        # Postgres (PostGIS + pgvector) and Redis, waits for health checks
pnpm db:migrate       # apply Prisma migrations
pnpm db:seed          # 300 synthetic Yerevan listings inside real district boundaries
pnpm check            # lint + typecheck + test + build across all workspaces
pnpm dev              # api on :3000, web on :5173
```

Verify the infrastructure:

```bash
docker compose exec postgres psql -U smartestate -d smartestate -c "SELECT extname, extversion FROM pg_extension WHERE extname IN ('postgis','vector');"
```

```bash
curl http://localhost:3000/health
```

## Everyday commands

| Command               | What it does                                                    |
| --------------------- | --------------------------------------------------------------- |
| `pnpm dev`            | Start all app dev servers with hot reload                       |
| `pnpm check`          | `lint`, `typecheck`, `test`, `build` for every workspace        |
| `pnpm lint`           | ESLint, zero warnings allowed                                   |
| `pnpm typecheck`      | `tsc --noEmit` per workspace                                    |
| `pnpm test`           | Vitest in every workspace (api unit + e2e, web, contracts)      |
| `pnpm build`          | Production builds into each workspace's `dist/`                 |
| `pnpm format`         | Prettier write; `pnpm format:check` in CI                       |
| `pnpm docker:up`      | Start infrastructure, build images if needed, wait for health   |
| `pnpm docker:down`    | Stop containers, keep data                                      |
| `pnpm docker:reset`   | **Destroy volumes** and start fresh — the documented demo reset |
| `pnpm docker:logs`    | Tail container logs                                             |
| `pnpm ml:test`        | Build the ML test image and run `pytest` inside it              |
| `pnpm ml:lint`        | `ruff check` + `ruff format --check` inside Docker              |
| `pnpm db:migrate`     | Apply pending Prisma migrations (`prisma migrate deploy`)       |
| `pnpm db:seed`        | Rebuild the synthetic market data (destructive for listings)    |
| `pnpm db:reset`       | Drop, migrate and seed the database from scratch                |
| `pnpm db:migrate:dev` | Create a migration from schema changes (development only)       |
| `pnpm db:studio`      | Open Prisma Studio                                              |
| `pnpm erd`            | Regenerate `docs/diagrams/erd.md` from the Prisma schema        |

Workspace-scoped runs: `pnpm --filter @smartestate/api test`, `pnpm --filter @smartestate/web dev`.

## Repository layout

```
apps/
  api/        NestJS modular monolith        src/modules/<bounded-context>/
  web/        React + Vite                   src/features/<feature>/{api,components,hooks,model}
  ml/         FastAPI ML service (Python)    app/{routers,schemas,pipelines,models}
packages/
  contracts/      Zod schemas + inferred types shared by api and web
  eslint-config/  Shared ESLint flat-config presets (base, node, react)
  tsconfig/       Shared compiler presets (base, node, react)
docs/
  adr/        Architecture Decision Records (Nygard format)
  diagrams/   C4, ERD and sequence diagrams as Mermaid
  api/        Exported OpenAPI spec
  thesis/     Evaluation results, benchmarks, notes
docker/       Purpose-built images (postgres with PostGIS + pgvector)
.github/      CI workflows
```

`packages/ui-tokens` is created in Phase 4 once the Figma tokens are available.

## Database

- Schema: [`apps/api/prisma/schema.prisma`](apps/api/prisma/schema.prisma); migrations in
  `apps/api/prisma/migrations`; ERD in [`docs/diagrams/erd.md`](docs/diagrams/erd.md).
- Extensions: PostGIS (geometry, GiST indexes), pgvector (768-d embeddings, HNSW index),
  citext (case-insensitive emails and street aliases). They are created by the first
  migration, so any empty Postgres 16 with the extensions installed works.
- Geometry and vector columns are `Unsupported` in Prisma and are accessed with raw SQL;
  `listing_embeddings` and PostGIS's `spatial_ref_sys` are declared external in
  `apps/api/prisma.config.ts` (see [ADR-0004](docs/adr/0004-postgresql-postgis-pgvector-with-prisma.md)).
- Seed data is synthetic and deterministic; district boundaries and points of interest come
  from OpenStreetMap (© OpenStreetMap contributors, ODbL). Design notes:
  [`docs/thesis/seed-data.md`](docs/thesis/seed-data.md). Refresh the OSM files with
  `pnpm --filter @smartestate/api osm:fetch -- --force`.
- Schema change workflow: edit `schema.prisma` → `pnpm db:migrate:dev -- --name <change>` →
  review the SQL → commit schema, migration and the regenerated ERD.

## API

Base URL `http://localhost:3000/api`; interactive docs at `http://localhost:3000/docs`, raw
document at `/docs/openapi.json` (exported copy: [`docs/api/openapi.json`](docs/api/openapi.json)).
Health probes live outside the prefix: `/health` (liveness) and `/health/ready` (database).

| Area      | Endpoints                                                                                                                                                                                   |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| auth      | `POST /auth/register`, `/auth/login`, `/auth/refresh`, `/auth/logout`, `/auth/logout-all`                                                                                                   |
| users     | `GET/PATCH /users/me`, `PUT /users/me/preferences`, admin: `GET /users`, `PATCH /users/:id/role`                                                                                            |
| listings  | `GET /listings` (filters, sort, cursor, `mine=true`), `GET /listings/:idOrPublicId`, `POST`, `PATCH /:id`, `POST /:id/transitions`, `DELETE /:id` (archive), admin: `DELETE /:id/permanent` |
| buildings | `GET /buildings/:id`, agent: `POST /buildings` (district derived from coordinates)                                                                                                          |
| geo       | `GET /districts`, `GET /districts/:slug/boundary` (GeoJSON)                                                                                                                                 |

Valuation, recommendations, better options, the mortgage refund, hybrid search and natural-language parsing have sections of their own below.

- **Sessions.** Access token: 15-minute JWT in `Authorization: Bearer`. Refresh token: httpOnly,
  SameSite=Strict cookie scoped to `/api/auth`, rotated on every refresh; replaying a consumed
  token revokes the whole session family. Passwords are Argon2id.
- **Roles.** `USER` (buyer, may also offer a property), `AGENT` (verified, publishes directly),
  `MODERATOR` (reviews the queue), `ADMIN`. Role decides which endpoints are reachable; ownership
  and listing status decide what may be done to a particular listing (see below).
- **Contracts.** Every request and response shape is a Zod schema in
  [`packages/contracts`](packages/contracts/src); the API validates with them and the OpenAPI
  components are generated from them (see [ADR-0005](docs/adr/0005-zod-first-api-contracts-and-session-design.md)).
- **Errors** always have the shape `{ statusCode, error, message, code?, details?, context? }`.
  `context` carries machine-readable detail from a domain rule, such as the transitions that would
  have been legal.
- **Locale** of listing texts: `?locale=` → user preference → `Accept-Language` → Armenian.

### Listing lifecycle

A listing's status describes its moderation state, not the state of a deal:

```
DRAFT ──SUBMIT──▶ PENDING_REVIEW ──APPROVE──▶ PUBLISHED ──ARCHIVE──▶ ARCHIVED
  │                     │                                               ▲
  │                  REJECT                                             │
  └──PUBLISH──▶ ...      ▼                                              │
              REJECTED ──REVISE──▶ DRAFT        (ARCHIVE from any live status)
```

- **Creating.** A listing from a `USER` enters `PENDING_REVIEW` immediately; one from an `AGENT`
  or staff is `PUBLISHED` at once. `PUBLISH` is the same step for a draft an agent already holds.
- **Moving.** Status changes only through `POST /listings/:id/transitions` with
  `{ action, reason? }`. `PATCH` does not accept a status. `REJECT` requires a reason, which is
  stored and shown back to the owner. A transition that is not legal from the current status is
  **409**, not 400.
- **Quotas.** A `USER` may hold three listings in `PENDING_REVIEW` or `PUBLISHED` at once, an
  `AGENT` fifty; exceeding it is **409** with code `LISTING_QUOTA_EXCEEDED`.
- **Who may do what** is decided in one place,
  [`listing.policy.ts`](apps/api/src/modules/listings/listing.policy.ts), from the role _and_ the
  row. Owners edit their own listings, moderators approve, reject and archive but do not rewrite,
  and only an administrator can delete permanently. A listing the caller may not see is reported
  as 404 rather than 403.
- **Searching.** `GET /listings` returns published listings; `mine=true` returns the caller's own
  in any status. Only a moderator may filter the whole catalogue by status. See
  [ADR-0009](docs/adr/0009-listing-lifecycle-rbac-abac.md).

Tests: `pnpm --filter @smartestate/api test:unit` (no I/O) and `test:integration` (boots the
real app against a Testcontainers PostgreSQL built from `docker/postgres`, migrated and seeded;
needs Docker). `pnpm test` runs both.

## Valuation

`GET /api/listings/:id/valuation` answers what the model thinks a listing is worth, and why. The
listing detail page shows it as a price check; a listing whose valuation cannot be produced simply
shows no panel.

- **Nothing is recomputed without reason.** A stored valuation is reused while the listing has not
  changed and the model has not been retrained. Recomputing an unchanged listing would produce a
  second figure differing from the first for no reason a reader could see.
- **A dead model service is not a dead listing page.** The last stored valuation is served instead,
  flagged as out of date when the listing has moved on since. Only when nothing was ever stored
  does the caller get a 503, and the interface then hides the panel rather than showing an error.
- **The request is not retried, and it times out in two seconds** (`ML_TIMEOUT_MS`). An estimate is
  an enhancement to the page; making the page slower to fail serves nobody.
- **Every figure is written down** in `valuation_records` with the model version that produced it,
  so a number in a screenshot can be traced months later and the A/B evaluation can compare models
  on the same listings.
- **Every number comes from the model or the database.** Nothing on that panel is generated text,
  and the disclaimer says plainly that this estimates an asking price, not a sale price.

## Recommendations

`POST /api/recommendations` ranks the catalogue against a buyer's stated preferences and returns
each listing with the arithmetic that put it there. See
[ADR-0011](docs/adr/0011-transparent-ranking.md).

- **Seven named criteria**: price against budget, value against the model's estimate, size, rooms,
  location, condition, and the building. Each scores to a number between 0 and 1 by a curve
  written out in `criteria.ts`, so a claim like "0.8 on price because it is 20% under budget" can
  be checked by hand.
- **Limits filter, preferences rank.** Budget, rooms, minimum area and districts are SQL filters.
  Everything else is a matter of degree.
- **Two aggregation methods**, weighted sum and TOPSIS, over the same criteria. They disagree in a
  way the thesis reports rather than resolves.
- **A criterion that cannot be measured is dropped, not defaulted.** With no model service there is
  no `value` score, so it leaves the run, the other weights are renormalised, and the response
  says which criteria were omitted.
- **Every run is stored** in `recommendation_sessions` with its preferences, strategy, method and
  full ordering, and the response carries the session id. The ranking comparison that is the
  thesis's contribution reads those rows, so they are written from the first request.
- **Every result explains itself.** `explanation.highlights` names up to four criteria that put the
  listing where it is — strengths first, then the trade-offs — each carrying the figure behind it as
  a number the client formats. Trade-offs are named as readily as strengths: a recommender that
  only gives reasons to say yes is an advertisement.
- **A model phrases those reasons; it never produces them.** `explanation.text` is a paragraph in
  the reader's language, present only when a model wrote one and it passed the check below. With
  `LLM_PROVIDER=rule-based` there is no paragraph and nothing is lost: the highlights are the
  explanation. `explanationSource` says which of the seven outcomes applied.
- **Every number in a generated paragraph is checked against the figures it was given.** The model
  is told a rank, a price, an area, a room count and the criteria — never the title, address or
  description. Afterwards each number in its answer must trace back to one of those, allowing for
  locale separators, million shorthand and the precision it was written to. A paragraph that quotes
  anything else is discarded and the computed reasons stand alone; the check is per listing, so one
  bad paragraph does not cost the page its prose. See
  [ADR-0014](docs/adr/0014-explanations-and-numeric-grounding.md).
- **One model call per page, not one per listing**, because the free tier allows about ten requests
  a minute and a page of results would spend all of it. `explain: false` skips the call entirely,
  for benchmarking and A/B runs.
- **The prompt and raw response are stored on the session** when a model was actually reached, so a
  paragraph can be reproduced months later.

## Better options

Given the listing somebody is looking at, which listings are simply better, and what does each of
the others cost them? See [ADR-0016](docs/adr/0016-dominance-and-alternatives.md).

```
GET /api/listings/:id/alternatives?limit=6&anchorLat=&anchorLon=&locale=en
  -> { subject, criteria, omittedCriteria, candidateCount, alternatives }
```

- **Pareto dominance, not a score.** An alternative that is at least as good on every criterion
  compared and better on at least one `DOMINATES`; everything else that is better on something is
  a `TRADE_OFF`, reported with what it gives up. Nothing is weighted, so nobody had to be asked
  how much price matters against size.
- **Indifference thresholds make dominance possible at all.** Two prices are never exactly equal,
  so each criterion has a difference below which the listings count as the same: 2% of the price,
  2 m², 200 m, a tenth of the condition and building scales.
- **Rooms and district filter, they do not score.** A candidate is in the same district, has at
  least as many rooms, and costs no more than 110% — the brief's "similar money".
- **Every comparison carries both figures**, so "this one is better" can be checked rather than
  believed.
- **`location` and `value` are dropped when they cannot be measured**, and `omittedCriteria`
  says which: dominance over five criteria is a weaker claim than over seven.
- **Nothing is a real answer.** A listing with no better option is a good buy, and the page says so
  rather than padding itself with near-misses.

Measured over the 21 two-room flats in Kentron: 3 have a strictly better alternative, 17 have only
trade-offs, 1 has nothing better. A mechanism that fired on everything would be describing
similarity, not superiority.

## Mortgage income-tax refund

Armenia refunds the personal income tax a buyer pays, up to the mortgage interest they pay, up to a
quarterly cap. It is large, it is specific to this market, and it is being withdrawn province by
province between now and 2029. See [ADR-0017](docs/adr/0017-mortgage-refund-rules-engine.md).

```
POST /api/mortgage/refund   { propertyValueAmd, loanAmountAmd, annualRatePct, termYears,
                              agreementDate, districtSlug, purchaseKind, quarterlyIncomeTaxAmd }
  -> { eligible, ineligibilityReasons, quarterlyRefund, totalRefundOverTerm,
       effectiveInterestRate, schedule, ruleSetVersion, calculatedAt }
```

- **The rules are rows, not constants.** `tax_refund_rule_sets` carries the property ceiling, the
  quarterly cap, the age limit and the per-province phase-out dates, with `effective_from` and
  `effective_to`. A change in the law is an insert, not a deployment.
- **Selected by the loan agreement date, never by today.** Which cap applies is a property of the
  loan, so a mortgage signed in 2024 keeps its 1,500,000 ֏ cap and a figure quoted then still
  reproduces now. The response names the rule set that produced it.
- **Per quarter, `refund = MIN(interest paid, income tax paid, cap)`**, with no carry-over. Unused
  interest in a capped quarter is simply lost, which is why the answer is a schedule and not a
  total.
- **A refusal is an explanation.** Every failed condition comes back — not the first — as a code and
  an i18n key with parameters, together with what the refund would have been.
- **Two numbers are not invented.** `maxApplicantAge` is null, meaning the condition does not
  exist rather than that the limit is unknown. The income tax rate is
  `MORTGAGE_INCOME_TAX_RATE_PCT` **with no default**: unset, the calculator asks for the tax paid
  instead of deriving it from a salary.
- **Not tax advice.** Every figure is an estimate from public information; the interface says so in
  all three languages and points at the State Revenue Committee.

A Yerevan mortgage signed today refunds nothing — the scheme ended there on 2025-01-01 — which is
why the seed includes listings in Gyumri, Vanadzor and Dilijan.

## Language model layer

Everything in the application that talks to a language model goes through
`LlmService.structured()`, which takes a schema **and a deterministic fallback** and always
returns a value. There is no path through it that throws, and no way to call it without having
written the non-model answer first. See [ADR-0012](docs/adr/0012-llm-provider-layer.md).

| Provider     | What it is                                                   |
| ------------ | ------------------------------------------------------------ |
| `rule-based` | The default. No network call; every caller uses its fallback |
| `gemini`     | Google AI Studio, free tier, Flash models                    |
| `ollama`     | A model on the developer's own machine                       |

`LLM_PROVIDER=rule-based` is not a degraded mode. The product is fully demonstrable with no key
at all, and choosing a model changes the wording of some sentences, never a number.

- **Five reasons an answer is the deterministic one**, each recorded separately so the thesis can
  report how often the model was actually used: `no-provider`, `quota`, `error`, `invalid`,
  `disabled`. A sixth, `cache`, means a previous model answer was reused.
- **The free tier's limits are hard limits.** Minute and day allowances are counted in Redis and
  shared across processes; exceeding either falls back rather than spending money, because billing
  is never enabled on that Google project.
- **Output is validated before use.** A model that answers with prose, or with the wrong types,
  triggers the fallback. Nothing half-understood reaches a user.
- **Every invocation is logged** with its prompt, model and raw response, and the trace is returned
  to the caller so a feature with a record of its own can store it.
- **Redis is optional.** Without it the layer works uncached, and quota counters that cannot be
  kept let the call through rather than refusing work because a cache is down.

## Natural-language search

The search page takes a sentence in Armenian, Russian or English — "two-room in Arabkir under 60
million, not ground floor" — and turns it into filters the reader can see and correct. See
[ADR-0013](docs/adr/0013-natural-language-query-parsing.md).

```
POST /api/search/parse?locale=en   { "query": "..." }
  -> { query, filters, unmapped, source }
```

It returns no listings. The client shows the filters as removable chips, lists the phrases it could
not place, and then runs an ordinary search with what is left standing.

- **The deterministic parser runs on every request**, and is the fallback the language model layer
  requires. With `LLM_PROVIDER=rule-based` it is the whole feature: a fresh checkout with no key
  parses all three languages. A model, when configured, is asked the same question and wins on
  disagreement — but only with an answer that validates against the same schema.
- **Inflected district names are matched by a bounded suffix rule**, so `Արաբկիրում` and
  `Арабкире` both find Arabkir without a morphological analyser for two languages.
- **A bound word belongs to one quantity.** "до 50 млн" three words after "двухкомнатная" sets the
  price, not the room count; price and area claim their bound words before rooms is matched.
- **What could not be parsed is reported, not swallowed.** "quiet" and "near a school" come back in
  `unmapped`, because a filter the reader cannot see is worse than none.
- **Twenty requests a minute per account**, per address when signed out — the same budget every
  AI endpoint draws on, since the free-tier allowance is shared by the whole installation.

## Hybrid search

A sentence is answered three ways at once: the exact part becomes filters, the words are matched by
full-text search, and the meaning is matched by embedding similarity. The two rankings are fused by
reciprocal rank fusion. See [ADR-0015](docs/adr/0015-hybrid-search.md).

```
POST /api/search/hybrid?locale=en   { "query": "...", "limit": 20, "filters": { ... } }
  -> { query, filters, unmapped, parseSource, arms, semanticSkipped?, rrfK, results }
```

Each result carries `ranks`, saying where each arm placed it — so a listing found by meaning and
not by words is visible as one.

- **Both arms search inside the filters**, built by the same function the ordinary listing search
  uses. A listing over budget is not a worse answer to "under 60 million"; it is not an answer.
- **Fusion is by rank, not by score.** `ts_rank` and cosine similarity have no common scale — on
  this encoder almost every pair scores between 0.75 and 0.95 — so the scores are discarded and
  only the order is kept, at `k = 60`.
- **Only the prose is embedded.** Rooms, area and district are already exact filters; in the vector
  as well, a fuzzy match could argue with an exact constraint.
- **One vector per listing, not one per language.** Measured on the real model, a Russian query
  matches an Armenian passage at 0.878 against 0.923 for the same language, and both beat an
  unrelated passage — cross-lingual retrieval works, so a second row would buy nothing.
- **Armenian has no stemmer in PostgreSQL**, so the lexical arm matches Armenian word forms rather
  than lemmas. Russian and English are stemmed.
- **Without vectors the search runs lexically and says so**, in `semanticSkipped`:
  `not-indexed` before the first backfill, `unavailable` when the encoder is down.

- **The sentence lives in the URL**, as `?q=`, so a ranked search is shareable and the back
  button returns to the list it came from. A link carrying only a sentence has its filters read
  into the address bar on arrival, so the reader always sees the constraints that were applied.
  While a sentence is active the sort control is hidden: a ranking is already an order.

### Building the index

```bash
pnpm embeddings:backfill
```

Needs the ML service running. Listings embed themselves when they are published, so this is for the
first run, a model change and a reseed. It skips anything whose text and model version are
unchanged, so a second run does no encoding at all.

## ML service

FastAPI on `http://localhost:8000`, started by `docker compose up`. It values listings, explains
the valuation, and encodes text for hybrid search; it never reads the database. The encoder is
`multilingual-e5-small` at a pinned revision, baked into the image so the container starts with no
network — which is most of why that image is about 2.9 GB and takes half a minute to come up. Set
`ML_EMBEDDINGS_ENABLED=false` to run valuations without loading it. See
[`apps/ml/README.md`](apps/ml/README.md) and
[ADR-0010](docs/adr/0010-price-valuation-model.md).

| Route               | What it does                                         |
| ------------------- | ---------------------------------------------------- |
| `GET /health`       | Liveness                                             |
| `GET /health/ready` | Readiness: 503 and a reason when no model is loaded  |
| `POST /predict`     | Values a batch of listings, with an 80% interval     |
| `POST /explain`     | Values one listing and names what moved the estimate |
| `GET /model`        | The deployed model: version, training set, metrics   |

- **What it predicts.** The log of price per m², converted back to dram before anything is
  reported. Area is divided out so the model cannot score well on floor area alone, and the log
  matches a market whose effects are proportional.
- **How good it is.** Measured two ways in every run, random k-fold and leave-one-district-out,
  both against a linear regression on area alone. The second is the honest one and is always
  worse. Figures are in [`docs/thesis/evaluation.md`](docs/thesis/evaluation.md), which the
  training run writes itself so the numbers and the deployed model cannot drift apart.
- **Why this price.** Exact TreeSHAP from LightGBM, expressed as a percentage effect per feature.
- **How certain.** Quantile boosters give a range, widened by a conformal factor measured out of
  fold, because the raw range covers well under its nominal 80%.
- **No model is a supported state.** The service starts, reports itself degraded and answers 503,
  rather than taking the stack down.

Training needs a seeded database and writes the artefact and the evaluation chapter together:

```bash
pnpm ml:train
```

Tests and lint run in Docker, so no local Python is needed: `pnpm ml:test`, `pnpm ml:lint`.

## Frontend data access

- Generated types: `apps/web/src/shared/api/schema.d.ts` from the exported OpenAPI document
  (`pnpm --filter @smartestate/web api:generate`; CI fails when stale). `openapi-fetch` uses them
  for a fully typed client; domain types come from `@smartestate/contracts`, and a compile-time
  test keeps the two in step.
- `apiRequest()` unwraps responses, converts failures to `ApiError` and refreshes the session
  once on 401. The access token lives only in memory (Zustand); the httpOnly refresh cookie
  restores it on reload.
- Server state: TanStack Query hooks per feature (`features/<name>/api`), exposed through each
  feature's `index.ts`. See [ADR-0006](docs/adr/0006-frontend-data-access.md).
- Development is same-origin: Vite proxies `/api`, `/health` and `/docs` to the API.

### Screens

| Route                                          | What it is                                                                       |
| ---------------------------------------------- | -------------------------------------------------------------------------------- |
| `/:locale`                                     | Landing page; a link into the search                                             |
| `/:locale/listings`                            | Search: sentence box, filter panel, sort, result grid, map view                  |
| `/:locale/listings/:idOrPublicId`              | One listing: photographs, specification, price history, location                 |
| `/:locale/listings/:idOrPublicId/alternatives` | The advisor: what is better than this listing, and what each option costs        |
| `/:locale/mortgage`                            | The income-tax refund calculator; `?price=&district=` prefills it from a listing |

- **Filters live in the query string**, not in component state, so a filtered search is
  shareable and the back button is correct. `features/listings/model/filters.ts` is the only
  place that reads or writes them, and anything malformed in the URL is dropped rather than
  sent to the API.
- **The map is MapLibre GL over OpenStreetMap raster tiles**: no access token, nothing
  proprietary, and it works from `docker compose up` on any machine. Attribution is displayed,
  as the tile service's usage policy requires. Set `VITE_MAP_TILE_URL` to use another provider.
  In dark mode the tiles are inverted in CSS, since the source has no dark variant.
- **Map logic that is worth testing lives outside the renderer** (`features/map/model`), because
  jsdom has no WebGL; the page tests replace the map component itself.

## Design system

Tokens live in [`packages/ui-tokens`](packages/ui-tokens); primitives live in
`apps/web/src/shared/ui` and are imported through that folder's `index.ts`.

- **Tokens are generated.** `src/tokens.ts` is the source of truth and
  `styles/tokens.css` is produced by `pnpm tokens:css`; CI fails when the committed CSS is
  stale. Each token records whether it came from Figma or was derived, and why: 39 of the 99
  are read from the design, 60 are derived because the design is a light-only landing page with
  no dark theme, no shadows and no status colours.
- **Theming is a variable swap.** `[data-theme="dark"]` overrides only the colour group, and
  `prefers-color-scheme` applies the same overrides when no explicit choice was made.
  Tailwind utilities point at the variables through `@theme inline`, so they follow the theme.
- **Three scripts, three faces.** Krona One has no Cyrillic and no Armenian, and Montserrat has
  no Armenian, so `styles/fonts.css` selects a face per locale with `:lang()`: English keeps
  the design faces, Russian uses Montserrat Bold for display, Armenian uses Noto Sans Armenian.
- **Contrast is tested, not assumed.** Three values in the design fail WCAG AA and are corrected;
  the token tests assert every foreground and background pair in both themes.
- **No literal colours in components**, enforced by a test that scans the primitives for hex
  codes, colour functions and non-token custom properties.

```bash
pnpm storybook
```

Storybook carries theme and locale in the toolbar, and each primitive has an `AllLanguages`
story rendering Armenian, Russian and English side by side. See
[ADR-0007](docs/adr/0007-design-system-tokens-and-multi-script-typography.md).

## Languages

Armenian is the default, English the fallback. The locale is the first path segment, so
`/hy/listings/123` and `/ru/listings/123` are different URLs for the same listing.

- **Detection order:** URL, then the signed-in account, then this browser's remembered choice,
  then `navigator.languages`, then Armenian. An unsupported locale in the URL is replaced, so
  `/de/listings` becomes `/hy/listings`.
- **Messages are ICU**, not i18next plural suffixes, because Russian needs four plural
  categories and Armenian selects the singular for zero. Catalogues are namespaced per feature
  under `apps/web/src/locales/<locale>/` and typed, so a mistyped key fails `pnpm typecheck`.
- **Formatting is `Intl`**, wrapped in `shared/i18n/formatters.ts`. Dram renders as ֏. Units
  are not formatter output: "m²" is Latin, so the square-metre and metre suffixes are translated
  strings in the listings catalogue.
- **Armenian needs the browser's full ICU data.** Current Chrome, Firefox and Safari ship it.
  A few reduced builds (some Electron shells, Node without full-icu) do not, and there
  `Intl` silently resolves `hy-AM` to `en-US`: the interface stays Armenian while dates and
  relative times come out in English conventions. Nothing breaks, and
  `Intl.DateTimeFormat.supportedLocalesOf(['hy-AM'])` tells you whether a given browser has it.
- **The catalogue is checked**, for key parity, ICU syntax, and whether each plural block covers
  the categories its language needs. Key parity alone would accept a Russian message copied from
  the English two-form shape.

```bash
pnpm i18n:check
```

See [ADR-0008](docs/adr/0008-internationalisation.md).

## Conventions

- **Commits** follow [Conventional Commits](https://www.conventionalcommits.org). Allowed
  scopes are listed in `commitlint.config.js`; the `commit-msg` hook rejects anything else.
- **Pre-commit** runs ESLint (fix, zero warnings) and Prettier on staged files.
- **TypeScript** is `strict` with `noUncheckedIndexedAccess`; `any` is a lint error.
- **Tests live next to the code** (`*.spec.ts` in api, `*.test.tsx` in web, `tests/` in ml).
- **Line endings** are LF everywhere, enforced by `.gitattributes`, so hook scripts and
  container entrypoints work on Linux regardless of the contributor's OS.
- **Environment** comes from `.env` (git-ignored); `.env.example` documents every variable.

## Troubleshooting

- **`ERR_PNPM_UNSUPPORTED_ENGINE`** — your Node or pnpm version is outside the pinned range.
  Install Node 24 (`nvm use` reads `.nvmrc`) and pnpm 9.15.x.
- **Port already in use** — change `POSTGRES_PORT`, `REDIS_PORT`, `API_PORT` or `WEB_PORT`
  in `.env` and restart.
- **Postgres extensions missing** — the init script only runs on an empty volume. Run
  `pnpm docker:reset` to reinitialise.
- **Husky hooks not running** — run `pnpm install` once; it executes the `prepare` script
  that installs the hooks.
