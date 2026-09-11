# SmartEstate — Master Build Prompt

> **How to use this file**
> 1. Clone your empty repo, add this file as `docs/BUILD_PROMPT.md`, commit.
> 2. Open Claude Code (or Cursor) in the repo root.
> 3. Paste **Section A** as your first message. It sets the ground rules.
> 4. Then work phase by phase using the kickoff prompts in **Section J**. Do not ask for the whole app in one message — you will get shallow code and the agent will lose context.
> 5. Before Phase 4 (UI), fill in **Section D.1** with your real Figma tokens.

---

## Section A — The prompt to paste first

You are a senior full-stack engineer and architect. We are building **SmartEstate**, a university thesis project: an AI-assisted apartment-search and buying-advisor platform for the Armenian real-estate market.

**Repository:** `https://github.com/meri0301/smartEstate` (currently empty, main branch)

Your job is to produce a production-grade, highly structured, well-documented codebase that can be defended in a thesis: every architectural decision must be justifiable, every module must have a clear single responsibility, and the code must be readable by an examiner who has never seen it before.

**Non-negotiable working rules:**

- Never write placeholder code, `// TODO: implement later`, or fake data returned from a function that is supposed to hit the database. If something cannot be finished in this step, say so explicitly and stop.
- Every file you create must be complete and runnable.
- Follow the folder structure in Section C exactly. If you believe a change is better, propose it and wait for my approval before restructuring.
- Write the test alongside the code, not afterwards.
- After each phase, output: (a) the list of files created or changed, (b) the commands to run and verify, (c) an "Architecture note" paragraph I can paste into my thesis.
- Use Conventional Commits (`feat(api): ...`, `fix(web): ...`, `docs(adr): ...`). Suggest the commit message at the end of each phase.
- Ask me clarifying questions before coding when a requirement is ambiguous. Do not guess business rules.
- All code, comments, commit messages, and documentation in English. Only user-facing strings are translated.

---

## Section B — Technology stack (decided)

### Backend: NestJS (TypeScript)

Chosen over Express, Django and Spring Boot for these thesis-defensible reasons:

| Criterion | Why NestJS wins here |
|---|---|
| Architecture | Enforces modular architecture with dependency injection out of the box. Gives you real chapter material on layered / hexagonal design instead of ad-hoc folders. |
| Type sharing | Same language as the React frontend, so DTOs and types live in one shared package and can never drift apart. |
| Testability | DI makes unit tests trivial to write with mocked providers. Easy to show high coverage. |
| Ecosystem | First-class Swagger/OpenAPI generation, validation pipes, guards, interceptors, WebSockets, queues. |
| Scope | One language across the whole repo keeps a solo thesis project finishable. |

### Full stack

- **Backend API:** NestJS 10 (TypeScript, strict mode), Fastify adapter
- **Database:** PostgreSQL 16 with **PostGIS** (geo queries) and **pgvector** (semantic search embeddings)
- **ORM:** Prisma (migrations, type-safe client, readable schema file that doubles as thesis documentation)
- **Cache / queues:** Redis + BullMQ (background jobs: embedding generation, price-model scoring, scraping)
- **ML service:** Python 3.12 + FastAPI + scikit-learn / LightGBM + pandas. Separate service, talks to NestJS over HTTP with a typed contract. This is where the price-prediction model lives, because the Python ML ecosystem is far stronger and it demonstrates polyglot microservice design.
- **LLM layer:** Anthropic Claude API via the NestJS service, for natural-language query parsing and human-readable recommendation explanations
- **Frontend:** React 18 + TypeScript + Vite
- **Routing:** React Router v6 (data routers, loaders)
- **Server state:** TanStack Query v5
- **Client state:** Zustand (small, filters and UI only)
- **Forms:** React Hook Form + Zod (Zod schemas shared with backend)
- **Styling:** Tailwind CSS + CVA for variants, or CSS Modules if the Figma design is highly custom. Decide after Section D.1 is filled in.
- **i18n:** react-i18next + ICU message format, `hy` / `ru` / `en`
- **Maps:** MapLibre GL JS with OpenStreetMap tiles (free, no vendor lock-in, works for Armenia)
- **Charts:** Recharts
- **Testing:** Vitest + React Testing Library (web), Jest + Supertest (api), Playwright (e2e), k6 (load), pytest (ml)
- **Monorepo:** pnpm workspaces + Turborepo
- **Infra:** Docker + Docker Compose for local dev, GitHub Actions for CI
- **Observability:** Pino structured logging, OpenTelemetry traces, `/health` and `/metrics` endpoints

---

## Section C — Repository structure

```
smartEstate/
├── apps/
│   ├── api/                        # NestJS backend
│   │   ├── src/
│   │   │   ├── modules/
│   │   │   │   ├── auth/           # JWT access + refresh rotation, RBAC
│   │   │   │   ├── users/
│   │   │   │   ├── listings/       # CRUD, search, filters
│   │   │   │   ├── search/         # semantic + structured hybrid search
│   │   │   │   ├── recommendations/# scoring, ranking, explanations
│   │   │   │   ├── valuation/      # proxy to ML service, fair-price verdict
│   │   │   │   ├── mortgage/       # affordability + Armenian tax refund calc
│   │   │   │   ├── favorites/
│   │   │   │   ├── comparisons/
│   │   │   │   ├── alerts/         # saved searches + notifications
│   │   │   │   ├── geo/            # districts, POI, commute, PostGIS queries
│   │   │   │   ├── ingestion/      # importers, normalisation, dedup
│   │   │   │   └── admin/
│   │   │   ├── common/             # guards, interceptors, filters, decorators, pipes
│   │   │   ├── infrastructure/     # prisma, redis, queue, llm, ml-client, storage
│   │   │   ├── config/             # typed env config with Zod validation
│   │   │   └── main.ts
│   │   ├── prisma/
│   │   │   ├── schema.prisma
│   │   │   ├── migrations/
│   │   │   └── seed.ts
│   │   └── test/
│   ├── web/                        # React frontend
│   │   ├── src/
│   │   │   ├── app/                # router, providers, error boundaries
│   │   │   ├── pages/
│   │   │   ├── features/           # feature-sliced: search, listing, advisor, ...
│   │   │   │   └── <feature>/
│   │   │   │       ├── api/        # query hooks
│   │   │   │       ├── components/
│   │   │   │       ├── hooks/
│   │   │   │       ├── model/      # types, zod schemas, store slices
│   │   │   │       └── index.ts    # public API of the feature
│   │   │   ├── shared/
│   │   │   │   ├── ui/             # design-system primitives from Figma
│   │   │   │   ├── lib/
│   │   │   │   ├── config/
│   │   │   │   └── api/            # axios/fetch client, interceptors
│   │   │   ├── locales/
│   │   │   │   ├── hy/
│   │   │   │   ├── ru/
│   │   │   │   └── en/
│   │   │   └── styles/
│   │   └── tests/
│   └── ml/                         # Python FastAPI ML service
│       ├── app/
│       │   ├── models/             # trained artefacts
│       │   ├── pipelines/          # feature engineering, training
│       │   ├── routers/
│       │   └── schemas/
│       ├── notebooks/              # EDA for the thesis
│       └── tests/
├── packages/
│   ├── contracts/                  # shared Zod schemas + TS types (single source of truth)
│   ├── ui-tokens/                  # design tokens generated from Figma
│   ├── eslint-config/
│   └── tsconfig/
├── docs/
│   ├── adr/                        # Architecture Decision Records, one per big choice
│   ├── diagrams/                   # C4 context/container/component, ERD, sequence
│   ├── api/                        # exported OpenAPI spec
│   └── thesis/                     # notes, benchmarks, evaluation results
├── docker/
├── .github/workflows/
├── docker-compose.yml
├── turbo.json
└── README.md
```

**Feature-Sliced Design** on the frontend and **modular monolith** on the backend. Both are named, published architectures you can cite in the thesis rather than inventing your own.

---

## Section D — Design system

### D.1 — FILL THIS IN BEFORE PHASE 4

The Figma file is at `https://www.figma.com/design/QHiYUWBBBtEeJSHLrvLEsP/SmartEstate?node-id=18-174`. The coding agent cannot open it. Give it the design context one of these ways, best first:

1. **Figma MCP connector** (Dev Mode). Connect Figma in Claude, then say "read node 18-174 and extract the tokens".
2. **Manual token export.** Paste this table filled in:

```
Colors:      primary, primary-hover, secondary, accent, success, warning, danger,
             bg, surface, border, text-primary, text-secondary, text-muted
Typography:  font family (must support Armenian — Mardoto, Arian AMU, Noto Sans
             Armenian, or check what Figma uses), sizes h1..h6/body/caption,
             weights, line heights
Spacing:     the scale, e.g. 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64
Radii:       sm / md / lg / full
Shadows:     card, dropdown, modal
Breakpoints: mobile / tablet / desktop
```

3. **Screenshots.** Export each frame as PNG and attach them to the relevant phase prompt.

**Critical font note:** whatever font the design uses must render Armenian (Unicode `U+0530–U+058F`) and Cyrillic. Verify before committing to it. Armenian glyphs are visually taller and wider than Latin, so line heights and button widths that look right in English often break in Armenian. Test every component with the longest Armenian string.

### D.2 — Rules

- Generate `packages/ui-tokens` first, as CSS custom properties plus a Tailwind theme extension. No hard-coded hex values anywhere in components.
- Build the primitive layer (`Button`, `Input`, `Select`, `Card`, `Badge`, `Modal`, `Tabs`, `Tooltip`, `Skeleton`, `Toast`) before any page.
- Every primitive gets a Storybook story showing all variants in all three languages.
- Dark mode via `data-theme` attribute and token swap, not duplicated styles.

---

## Section E — Domain model (Armenia-specific)

This is what separates a generic "real estate clone" from a thesis with a real contribution. Model the Armenian market properly.

### Core entities

`User`, `Profile`, `Listing`, `Building`, `District`, `Media`, `Favorite`, `SavedSearch`, `Comparison`, `ValuationRecord`, `RecommendationSession`, `AuditLog`

### Listing fields that matter in Armenia

```
price (AMD, with USD/EUR display conversion via daily CBA rate)
priceNegotiable: boolean
area: total / living / kitchen (m²)
rooms, ceilingHeight (m)   # ceiling height genuinely affects price here
floor / totalFloors
buildingType: STONE | PANEL | MONOLITH | KHRUSHCHYOVKA | STALINKA | NEW_BUILD
constructionYear
seismicRetrofit: boolean    # Armenia is a high-seismicity zone
condition: NEEDS_REPAIR | OLD_RENOVATION | GOOD | EURO_RENOVATION | DESIGNER
elevator, balcony/loggia count, parking, storage (nկուղ)
heating: CENTRAL_GAS | INDIVIDUAL_GAS_BOILER | ELECTRIC | NONE
ownershipDocs: verified | unverified   # cadastre certificate status
district (Yerevan: Kentron, Arabkir, Ajapnyak, Avan, Davtashen, Erebuni,
          Kanaker-Zeytun, Malatia-Sebastia, Nor Nork, Nork-Marash,
          Nubarashen, Shengavit) + marz-level support for Gyumri, Vanadzor, Dilijan
location: PostGIS POINT
```

### Derived / computed

- `pricePerSqm` (the single most important comparison metric in this market)
- `distanceToMetro`, `distanceToSchool`, `distanceToKindergarten`, `distanceToPark`, `distanceToHospital` (PostGIS `ST_Distance`)
- `walkScore`-style composite from POI density
- `fairPriceEstimate` and `priceDeviationPct` from the ML service
- `investmentScore`: estimated rental yield vs purchase price

### Armenian-specific business logic worth building

1. **Mortgage income-tax-refund calculator.** Armenia lets buyers reclaim income tax against mortgage interest, within caps. This is a real, locally meaningful financial feature no generic clone has. Model it as a versioned rules object in the database so the rules can be updated without redeploying, and so you can explain the design choice in the thesis.
2. **Multi-currency.** Prices listed in AMD and USD in the real market. Store canonical AMD, fetch the daily CBA rate on a cron, snapshot the rate used for each valuation so historical numbers stay reproducible.
3. **Seismic risk flag.** Cross-reference construction year and building type against post-1988 seismic codes. Show an informational badge, worded carefully as an indicator rather than an engineering assessment.
4. **Building-type price effect.** Stone vs panel vs monolith has a large, well-known price effect in Yerevan. Make it an explicit model feature and show the coefficient in your thesis evaluation chapter.
5. **Address normalisation.** Armenian addresses appear in Armenian, Russian and Latin transliteration with wildly inconsistent spelling. Build a normaliser with a street-alias table. This is genuine thesis material: transliteration and fuzzy matching.

---

## Section F — The AI layer (the thesis core)

Build three distinct, separable AI capabilities. Keep them separable so you can evaluate each independently.

### F.1 Price valuation model (supervised regression, Python service)

- Train LightGBM / Gradient Boosting on listing features. Baseline: linear regression on `area` alone, so you have something to beat.
- Report MAE, RMSE, MAPE, R². Use spatial cross-validation (hold out whole districts) so the model cannot memorise neighbourhoods. Say so in the thesis.
- Use SHAP values for feature importance. Surface the top three factors in the UI: "this is priced 12% above estimate, mainly due to floor and building type."
- Version every model artefact. Store `modelVersion` on each `ValuationRecord`.

### F.2 Hybrid semantic search (pgvector)

- Embed listing descriptions and key attributes. Store vectors in pgvector with an HNSW index.
- Hybrid retrieval: combine vector similarity with structured SQL filters via Reciprocal Rank Fusion. Do not use pure vector search; document why the hybrid beats each half.
- Natural-language queries in three languages: "quiet 2-room near a school in Arabkir, under 60 million, not ground floor". An LLM call parses free text into a structured filter object validated by a Zod schema, then the hybrid search runs. Always show the parsed filters to the user as editable chips so the system is transparent and correctable.

### F.3 Personalised recommendation and advisor

- **Cold start:** short onboarding preference quiz (budget, rooms, commute anchor point, priorities ranked).
- **Warm signals:** implicit feedback from views, dwell time, favorites, comparisons, dismissals.
- **Scoring:** transparent weighted multi-criteria model rather than an opaque net. For a thesis, explainability beats a marginal accuracy gain, and you can defend the trade-off. Consider TOPSIS or weighted-sum MCDA, both citable methods.
- **Explanations:** an LLM turns the score breakdown into one honest paragraph per listing, in the user's language. Feed it only the computed numbers so it cannot invent facts. Never let the model generate prices or attributes.
- **The "better option" feature from your brief:** given a listing the user is looking at, find alternatives that dominate it (cheaper or larger or better located for similar money) and explain the trade-off of each. This is the page in your Figma design.

### F.4 Guardrails (mention this in your thesis, examiners love it)

- No LLM output is ever trusted as fact. Every number in the UI comes from the database or the ML service.
- Log every prompt, model version, and response for reproducibility.
- Rate-limit AI endpoints per user.
- Handle the LLM being down: the app must degrade to normal filtered search, never a blank page.

---

## Section G — Internationalisation (hy / ru / en)

- Default locale `hy`, fallback `en`. Detection order: URL path segment → user profile → `localStorage` → `Accept-Language`.
- Routes carry the locale: `/hy/listings/123`, `/ru/listings/123`. Better for SEO and shareable links than a hidden cookie.
- Namespaced JSON translation files per feature, not one giant file.
- ICU MessageFormat for plurals. **Armenian and Russian have different plural rules from English.** Russian has `one/few/many/other`. Get this right, it is a visible detail.
- Locale-aware formatting for numbers, currency (AMD with the `֏` symbol), and dates via `Intl`.
- Listing content itself is multilingual: `ListingTranslation` table keyed by `listingId + locale`. Auto-translate missing locales with the LLM, flag them as machine-translated, let admins correct them.
- CI check: fail the build if a key exists in one locale file and not the others.
- Test every component at its longest translation. Armenian strings often run 20–40% longer than English.

---

## Section H — Feature ideas to make this thesis-grade

Pick the ones you can actually finish. Better to ship six deeply than fifteen shallowly.

**High value, clearly thesis-worthy**

1. **Explainable "better option" engine.** Your core page. Dominance analysis with trade-off explanations.
2. **Fair price verdict badge.** Underpriced / fair / overpriced with confidence interval and the top drivers.
3. **Side-by-side comparison table** for up to four listings, with computed winner-per-criterion highlighting.
4. **Affordability and total cost of ownership calculator.** Mortgage schedule, down payment, notary and cadastre fees, agent commission, the tax refund, plus monthly utilities estimate by building type and area. Real buyers in Armenia do not know their true total cost, so this is a genuine contribution.
5. **Commute-first search.** Draw an isochrone from a workplace or university and search inside it, rather than searching by district. Uses PostGIS plus an OSRM instance.
6. **Price history and district trend charts.** Tracks price changes over time per district and per m².
7. **Saved searches with alerts.** Background job diffs new listings against saved criteria and emails or in-app notifies.

**Strong differentiators**

8. **Listing quality and trust score.** Detects duplicate listings across sources, photo reuse (perceptual hashing), suspiciously low prices, and missing documents. Fraud is a real problem in the Armenian classifieds market.
9. **Photo analysis.** Vision model classifies renovation condition and room type from images, cross-checks against the declared condition. Flags mismatches.
10. **Neighbourhood profile pages.** Aggregate stats, POI density, average price per m², typical building stock, demographics where public data exists.
11. **Seismic and building-stock advisory.** Informational only, carefully worded.
12. **Buyer document checklist.** Step-by-step guide to what a purchase requires in Armenia (cadastre certificate, notary, registration), localised, with progress tracking.

**Nice engineering showcase**

13. **Admin dashboard** with model metrics, drift monitoring, and a manual retrain trigger.
14. **A/B testing harness** for two ranking strategies, with a results page. Directly gives you an evaluation chapter.
15. **Offline-capable PWA** with installable app and cached favorites.
16. **Accessibility:** full keyboard navigation, WCAG 2.1 AA, screen-reader tested. Easy thesis points, rarely done.
17. **Real-time viewing counters** over WebSockets ("3 people viewing this now").
18. **Export a comparison to PDF** in the user's language.

---

## Section I — Non-functional requirements

**Security**
- Argon2id password hashing, JWT access (15 min) + refresh rotation with reuse detection, refresh tokens in httpOnly SameSite cookies
- RBAC: `USER`, `AGENT`, `MODERATOR`, `ADMIN`
- Zod validation at every boundary, Helmet, strict CORS, per-route rate limits
- Parameterised queries only, signed upload URLs, file type and size validation on upload
- No secrets in the repo. `.env.example` committed, `.env` git-ignored.

**Performance**
- Target: p95 API response under 200 ms for search, under 50 ms cached
- Redis caching with explicit invalidation strategy, documented
- Cursor pagination everywhere, never `OFFSET` on large tables
- Indexes: GiST on geometry, HNSW on embeddings, composite B-tree on `(district, price, rooms)`
- Frontend: route-level code splitting, image lazy loading with AVIF/WebP and blur placeholders, virtualised long lists, Lighthouse over 90 on all four categories

**Quality**
- TypeScript `strict: true`, `noUncheckedIndexedAccess`, zero `any` (enforced by lint)
- ESLint + Prettier + Husky + lint-staged + commitlint
- Coverage gate: 80% on domain and service layers
- CI runs lint, typecheck, unit, integration (Testcontainers Postgres), e2e, build. Red CI blocks merge.

**Documentation (thesis deliverables)**
- ADR per major decision, using the Nygard template. At minimum: why NestJS, why PostgreSQL with PostGIS and pgvector, why a separate Python ML service, why hybrid search, why MCDA over a neural ranker, why Feature-Sliced Design.
- C4 diagrams (context, container, component) plus an ERD, all as Mermaid in `docs/diagrams` so they version with the code.
- Sequence diagrams for the search, valuation and recommendation flows.
- OpenAPI spec exported to `docs/api`.
- `docs/thesis/evaluation.md` with model metrics, load-test results, and Lighthouse scores. Numbers in a thesis beat adjectives.

---

## Section J — Build phases

Give the agent one phase per message. Wait for it to finish and verify before moving on.

**Phase 0 — Foundation**
> Initialise the pnpm + Turborepo monorepo per Section C. Set up TypeScript configs, ESLint, Prettier, Husky, commitlint, `.env.example`, `docker-compose.yml` with Postgres 16 + PostGIS + pgvector + Redis, and a GitHub Actions CI workflow. Scaffold empty `apps/api`, `apps/web`, `apps/ml`, and `packages/contracts`. Write the root README with setup instructions. Do not write any feature code.

**Phase 1 — Data layer**
> Write the complete Prisma schema for the domain model in Section E, including PostGIS geometry and pgvector columns via `Unsupported` types plus raw-SQL migrations where Prisma lacks support. Add all indexes. Write a seed script generating 300 realistic Yerevan listings across all 12 districts with plausible prices, and the district polygons. Generate the Mermaid ERD into `docs/diagrams`.

**Phase 2 — Core API**
> Build auth (register, login, refresh with rotation, logout, RBAC guard), users, and listings CRUD plus the structured search endpoint with all filters, cursor pagination and sorting. Full Swagger annotations. Unit tests for services, integration tests with Testcontainers.

**Phase 3 — Contracts and API client**
> Populate `packages/contracts` with Zod schemas as the single source of truth, consumed by both NestJS DTOs and the React forms. Generate the typed frontend API client.

**Phase 4 — Design system** *(fill in Section D.1 first)*
> Build `packages/ui-tokens` from the Figma tokens below, then the primitive component library with Storybook stories. Verify each primitive with Armenian, Russian and English strings.

**Phase 5 — i18n**
> Wire react-i18next per Section G: locale routing, namespaced files, ICU plurals for all three languages, `Intl` formatters, language switcher, and the CI key-parity check.

**Phase 6 — Frontend core**
> Build the search page, listing detail page, and the map view against the real API. This is the Figma design; match it exactly.

**Phase 7 — ML service**
> Build `apps/ml`: FastAPI service, feature pipeline, LightGBM training script, SHAP explanations, `/predict` and `/explain` endpoints, pytest suite, and an EDA notebook. Document metrics in `docs/thesis/evaluation.md`.

**Phase 8 — AI features**
> Valuation module, hybrid semantic search with pgvector and RRF, natural-language query parsing with editable filter chips, the MCDA recommendation engine, and LLM explanations with the guardrails in Section F.4.

**Phase 9 — The advisor page**
> The "better option" page: dominance analysis, alternatives, trade-off explanations, comparison table.

**Phase 10 — Selected features from Section H**
> One at a time.

**Phase 11 — Hardening**
> Load tests with k6, Lighthouse audit and fixes, accessibility audit, error boundaries and empty/loading/error states everywhere, security review, final documentation and ADRs.

---

## Section K — Questions to answer before starting

1. How many months do you have, and roughly how many hours a week?
2. Does the thesis require a specific "scientific contribution" section? If so, the strongest candidate is the comparative evaluation of ranking strategies (Phase 8 plus the A/B harness in Section H.14), so plan for it early.
3. Where will listing data come from? Your own seed data is fine for a thesis and avoids legal questions about scraping. If you want real data, check the terms of service of any source first and write about the ethics in the thesis.
4. Do you have an Anthropic API key, or does the LLM layer need a local model fallback?
5. Is deployment part of the requirement, or is `docker compose up` sufficient for the defence?
