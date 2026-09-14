# 0006 — Frontend data access: generated client types over the shared contracts

**Status:** Accepted
**Date:** 2026-09-14

## Context

The brief asks for a typed frontend API client, TanStack Query for server state and Zustand
for the little client state that exists. The API already publishes an OpenAPI document
generated from the Zod contracts (ADR-0005). The question is how the React app should talk to
it without a second, hand-maintained description of every endpoint, and how sessions should be
held in the browser given that refresh tokens live in an httpOnly cookie.

## Decision

1. **Generate path-level types, not code.** `openapi-typescript` turns `docs/api/openapi.json`
   into `apps/web/src/shared/api/schema.d.ts` (committed; CI fails when stale). `openapi-fetch`
   provides a 6 kB runtime client typed by those paths: URL, method, parameters, body and
   response are all checked at compile time, and there is no generated code to review. Domain
   types in UI code still come from `@smartestate/contracts`; a compile-time test asserts that
   the generated response types and the contract types are mutually assignable, so a change on
   either side is caught by `pnpm typecheck`.
2. **One request wrapper.** `apiRequest(() => api.GET(...))` unwraps the `{ data, error }`
   result, converts every failure into `ApiError` (the shared envelope, with `fieldErrors()`
   for forms) and, on a 401, refreshes the session once and replays the _operation_. Replaying
   the operation rather than the consumed `Request` avoids body-stream reuse problems. Auth
   routes opt out so a failed login is never "retried".
3. **Session in memory.** The access token and user live in a Zustand store and nowhere else:
   `localStorage` is readable by injected scripts, a closure is not. After a reload one
   `POST /api/auth/refresh` (cookie-authenticated) restores the session or settles it to
   anonymous before protected queries run. Refreshes are single-flight so a burst of expired
   requests cannot trigger several rotations and trip the API's reuse detection.
4. **Server state in TanStack Query** with hierarchical keys, 30 s freshness, no retries for
   4xx, two retries for network/5xx. Search is an infinite query whose page parameter is the
   API's opaque cursor. Feature folders expose their hooks through an `index.ts` public API
   (Feature-Sliced Design); components never import `shared/api` directly for data.
5. **Same-origin by default.** Vite proxies `/api`, `/health` and `/docs` to the API in
   development so cookies and CORS behave exactly as in the Docker deployment;
   `VITE_API_BASE_URL` overrides it only for split deployments.

Alternatives rejected: a generated SDK (Orval, openapi-generator) — more code to review and
a second source of types; axios interceptors retrying the raw request — stream reuse and
retry-loop hazards; storing tokens in `localStorage` — XSS exposure for no functional gain.

## Consequences

- Adding an endpoint on the API regenerates two files (`openapi.json`, `schema.d.ts`), both
  enforced by CI; the hook that uses it is a few lines.
- Response bodies are trusted as typed, not re-parsed with Zod at runtime; the drift test and
  the API's own validation make that acceptable. A runtime parse can be added per hook where
  the UI must be defensive (for example third-party data).
- The web app depends on `@smartestate/contracts` at build time only (types and enums).
- Phase 3 of the brief is therefore complete except for UI, which arrives with the design
  system (Phase 4) and pages (Phase 6).
