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

| Command             | What it does                                                    |
| ------------------- | --------------------------------------------------------------- |
| `pnpm dev`          | Start all app dev servers with hot reload                       |
| `pnpm check`        | `lint`, `typecheck`, `test`, `build` for every workspace        |
| `pnpm lint`         | ESLint, zero warnings allowed                                   |
| `pnpm typecheck`    | `tsc --noEmit` per workspace                                    |
| `pnpm test`         | Vitest in every workspace (api unit + e2e, web, contracts)      |
| `pnpm build`        | Production builds into each workspace's `dist/`                 |
| `pnpm format`       | Prettier write; `pnpm format:check` in CI                       |
| `pnpm docker:up`    | Start infrastructure, build images if needed, wait for health   |
| `pnpm docker:down`  | Stop containers, keep data                                      |
| `pnpm docker:reset` | **Destroy volumes** and start fresh — the documented demo reset |
| `pnpm docker:logs`  | Tail container logs                                             |
| `pnpm ml:test`      | Build the ML test image and run `pytest` inside it              |
| `pnpm ml:lint`      | `ruff check` + `ruff format --check` inside Docker              |

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
