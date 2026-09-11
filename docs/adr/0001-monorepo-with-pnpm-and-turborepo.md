# 0001 — Monorepo with pnpm workspaces and Turborepo

**Status:** Accepted
**Date:** 2026-09-11

## Context

SmartEstate consists of a NestJS API, a React web app, a Python ML service and shared
TypeScript packages (contracts, design tokens, lint and compiler presets). The project is
built by a single developer within a fixed four-month budget. The API and the web app must
share request/response schemas so that they cannot drift apart, and every workspace must
apply identical lint, format and compiler rules so the examiner sees one coherent codebase.

Alternatives were separate repositories per service, a single-package repository, or a
monorepo driven by Nx, Lerna, or plain npm workspaces.

## Decision

Use a single repository with **pnpm workspaces** for dependency management and **Turborepo**
for task orchestration.

- pnpm's content-addressable store and strict `node_modules` layout prevent phantom
  dependencies: a workspace can only import what it declares. This keeps module boundaries
  honest, which matters for the modular-monolith argument in the thesis.
- `workspace:*` protocol links `@smartestate/contracts` into both apps at source level; a
  schema change fails the consuming app's type-check immediately.
- Turborepo provides a task graph (`build → typecheck/lint/test`) with content-hashed
  caching. Compared with Nx it has a much smaller configuration surface, which suits a solo
  project; compared with Lerna or raw workspaces it adds correct cross-package ordering and
  caching without custom scripts.
- The Python service lives in `apps/ml` but is deliberately **not** a pnpm workspace: it has
  no `package.json`, is driven by Docker locally and by a dedicated CI job. Mixing package
  managers inside pnpm would add fragility for no gain.

## Consequences

- One `pnpm install`, one `pnpm check`, one CI pipeline. Onboarding is a single command.
- Shared presets (`packages/tsconfig`, `packages/eslint-config`) are versioned with the code
  that uses them, so tooling drift between apps is impossible.
- Developers must install pnpm (via `corepack` or `npm i -g pnpm@9`); npm and yarn are
  rejected by `engine-strict`.
- Python developers need either Docker or a local Python 3.12; the repository provides
  Docker-based `pnpm ml:test` / `pnpm ml:lint` wrappers so no local Python is required.
- Turborepo's remote cache is not used (no hosted infrastructure in scope); local caching
  still cuts repeated `pnpm check` runs to seconds.
