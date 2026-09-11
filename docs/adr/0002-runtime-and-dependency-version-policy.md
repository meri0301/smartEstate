# 0002 — Runtime and dependency version policy

**Status:** Accepted
**Date:** 2026-09-11

## Context

The original build brief (written earlier) named NestJS 10, React 18 and Node 22. At project
start (September 2026) the ecosystem had moved: NestJS 12, React 19.3, ESLint 10, Vite 8,
Vitest 5, Jest 30 and TypeScript 7.0 are current. The developer machine runs Node 24.18 (the
active LTS line) and has no pnpm or Python installed.

Two forces conflict: a thesis benefits from modern, well-supported tooling that will still be
current at defence time, but also from a **stable** toolchain whose parts are known to work
together. TypeScript 7.0 in particular is a new native (Go) compiler; the two type-aware tools
this project relies on, `typescript-eslint` (peer range `<6.1`) and `ts-jest` (peer range `<7`),
do not yet support it, and the NestJS 12 CLI itself pins TypeScript `~6.0`.

## Decision

1. **Runtime:** Node 24 LTS, pinned by `.nvmrc`, `engines` and `engine-strict=true`.
   Node 22 (the brief's target) is in maintenance; 24 is what is installed and is LTS.
2. **Package manager:** pnpm 9.15.x, pinned by the `packageManager` field so `corepack` and
   `pnpm/action-setup` resolve the identical version locally and in CI. pnpm 10 changed
   lifecycle-script defaults and is deferred to avoid unrelated churn mid-thesis.
3. **TypeScript 6.0.x**, not 7.0: the last release of the JavaScript-based compiler, fully
   supported by the lint and test toolchain. Upgrading to 7 is a follow-up once
   `typescript-eslint` and `ts-jest` publish support.
4. **Latest stable majors** for frameworks: NestJS 12, React 19, Vite 8, Vitest 5, Jest 30,
   ESLint 10 (flat config). The brief's older majors would be two releases behind at defence.
5. **Vitest as the single test runner**, replacing the brief's Jest + Supertest for the API.
   NestJS 12 ships ESM-only packages and its own CLI scaffolds Vitest; Jest 30 can only
   load ESM dependencies under Node's experimental `--experimental-vm-modules` flag. One
   runner across api, web and contracts also means one assertion API, one coverage tool
   and one config style for the examiner to learn. Fastify's built-in `inject()` replaces
   Supertest for HTTP-level tests, removing a dependency.
6. **Exact versions** in every `package.json` (`save-exact=true`) plus a committed lockfile,
   so any examiner can reproduce the exact dependency tree.
7. **Python 3.12** for the ML service, pinned by `.python-version` and `requires-python`.
   Python dependencies use bounded ranges (`>=x.y,<next-major`) because scientific packages
   release patch fixes frequently; the Docker image build is the reproducibility boundary.

## Consequences

- The repository will not install under Node 22 or pnpm 10; the error is explicit and
  immediate rather than a subtle runtime difference.
- TypeScript 6.0 emits deprecation notices for some legacy compiler options. The shared
  presets in `packages/tsconfig` avoid those options (`module: node20`, no `baseUrl`,
  explicit `types`).
- Deviating from the brief's majors is documented here so the thesis can cite the reason.
- Dependency bumps are routine `chore(deps)` commits; major upgrades get a new ADR only when
  they change architecture (for example the eventual move to TypeScript 7).
