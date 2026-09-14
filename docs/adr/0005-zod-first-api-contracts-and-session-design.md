# 0005 — Zod-first API contracts, and the authentication session design

**Status:** Accepted
**Date:** 2026-09-11

## Context

The brief requires validation at every boundary, an OpenAPI document, and request/response
types shared between the NestJS API and the React client so they cannot drift. It also
requires Argon2id password hashing, short-lived access tokens, refresh-token rotation with
reuse detection, refresh tokens in httpOnly cookies, role-based access control and per-route
rate limits.

NestJS's conventional stack (class-validator DTOs plus `@ApiProperty` decorators) defines the
same shape three times: a class, its decorators, and again on the client. The two established
Zod adapters for NestJS did not declare support for NestJS 12 at the time of writing.

## Decision

### Contracts

1. **`@smartestate/contracts` is the single source of truth.** Every request body, query
   string, path parameter and response is a Zod schema; TypeScript types are `z.infer` of them.
   Enum value lists mirror the Prisma enums and a test asserts the equality.
2. **A small in-house bridge** (`apps/api/src/common/zod/`) turns a schema into a NestJS DTO
   class: a global `ZodValidationPipe` parses any parameter typed with such a class (coercing
   query strings and applying defaults), and the class exposes `_OPENAPI_METADATA_FACTORY`,
   the hook `@nestjs/swagger` reads for property metadata. After document generation, each
   component schema is replaced by the exact JSON Schema Zod 4 emits (`z.toJSONSchema`,
   OpenAPI 3.0 dialect), so documentation equals validation. Zod 4's native JSON Schema output
   made a third-party adapter unnecessary.
3. **Errors share one envelope** (`ApiError`: status, error, message, machine-readable `code`,
   optional field `details`), produced by a global filter that also maps database constraint
   violations to 409/404/422.

### Sessions

4. **Argon2id** (OWASP minimum parameters) via `@node-rs/argon2`; failed logins for unknown
   emails still run a full verification against a decoy hash so timing does not reveal which
   accounts exist.
5. **Access tokens** are HS256 JWTs valid for 15 minutes, sent as `Authorization: Bearer`.
   **Refresh tokens** are 384-bit random strings stored only as SHA-256 hashes, delivered in an
   httpOnly, SameSite=Strict cookie scoped to `/api/auth`, valid for 30 days.
6. **Rotation with reuse detection.** Every refresh consumes the token and issues a new one in
   the same _family_. Presenting a consumed token revokes the entire family: a stolen token
   used after the legitimate client has refreshed ends both sessions, and the legitimate
   client is forced to log in again, which is the desired outcome.
7. **Authorisation** is two global guards: `JwtAuthGuard` (routes are protected unless marked
   `@Public()`, and a valid token on a public route still identifies the caller) and
   `RolesGuard` (`@Roles(...)`). Listing mutations additionally check ownership in the service.
8. **Rate limiting** uses Fastify's own plugin: a global per-IP budget from configuration plus
   a fixed 10 requests/minute on register, login and refresh via `@RouteConfig`.

## Consequences

- Adding an endpoint means writing one Zod schema and one controller method; the OpenAPI
  document, request validation and the client types follow automatically.
- The bridge is ~150 lines of our own code and must be maintained when `@nestjs/swagger`
  changes its metadata hook; it is covered by unit tests and an integration test that checks
  the generated document.
- Response bodies are typed but not re-validated at runtime; a serializer step can be added
  later if the cost is acceptable.
- Rate-limit counters are in-process; a Redis store replaces them when the API scales beyond
  one instance (Redis is already part of the stack for LLM caching).
- Integration tests boot the real application against a Testcontainers PostgreSQL built from
  the project's own Dockerfile, migrated and seeded identically to the development database,
  so the tests exercise PostGIS predicates and keyset pagination for real.
