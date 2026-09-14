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
- **Formatting is `Intl`**, wrapped in `shared/i18n/formatters.ts`. Dram renders as ֏.
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
