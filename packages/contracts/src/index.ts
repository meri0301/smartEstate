/**
 * Public API of `@smartestate/contracts` — the single source of truth for every
 * request and response shape exchanged between `apps/api` and `apps/web`.
 *
 * Zod schemas validate at both boundaries; the `z.infer` types derived from them
 * are the only DTO types either side uses, so the two cannot drift apart.
 */
export * from './auth.js';
export * from './common/index.js';
export * from './geo.js';
export * from './listings.js';
export * from './users.js';
