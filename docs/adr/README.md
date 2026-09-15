# Architecture Decision Records

One record per significant, hard-to-reverse decision, written in the Nygard format
(Context → Decision → Consequences). Records are immutable once accepted; a change of
direction is a new record that supersedes the old one.

| ID                                                               | Title                                                                          | Status   |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------ | -------- |
| [0001](0001-monorepo-with-pnpm-and-turborepo.md)                 | Monorepo with pnpm workspaces and Turborepo                                    | Accepted |
| [0002](0002-runtime-and-dependency-version-policy.md)            | Runtime and dependency version policy                                          | Accepted |
| [0003](0003-docker-compose-as-deployment-target.md)              | Local Docker Compose as the only deployment target                             | Accepted |
| [0004](0004-postgresql-postgis-pgvector-with-prisma.md)          | PostgreSQL with PostGIS and pgvector, accessed through Prisma                  | Accepted |
| [0005](0005-zod-first-api-contracts-and-session-design.md)       | Zod-first API contracts, and the authentication session design                 | Accepted |
| [0006](0006-frontend-data-access.md)                             | Frontend data access: generated client types over the shared contracts         | Accepted |
| [0007](0007-design-system-tokens-and-multi-script-typography.md) | Design system: generated tokens, Tailwind v4, and multi-script typography      | Accepted |
| [0008](0008-internationalisation.md)                             | Internationalisation: locale in the URL, ICU messages, and a checked catalogue | Accepted |
| [0009](0009-listing-lifecycle-rbac-abac.md)                      | Listing lifecycle: a state machine, and ABAC layered on RBAC                   | Accepted |
| [0010](0010-price-valuation-model.md)                            | Price valuation: target, validation, explanations and interval                 | Accepted |
| [0011](0011-transparent-ranking.md)                              | Ranking: transparent multi-criteria scoring, and what gets recorded            | Accepted |
| [0012](0012-llm-provider-layer.md)                               | The language model layer: a fallback-first interface                           | Accepted |
| [0013](0013-natural-language-query-parsing.md)                   | Natural-language query parsing: rules first, the model as a second opinion     | Accepted |
| [0014](0014-explanations-and-numeric-grounding.md)               | Explanations: computed reasons, and a paragraph checked against its figures    | Accepted |
| [0015](0015-hybrid-search.md)                                    | Hybrid search: local embeddings, full text, and reciprocal rank fusion         | Accepted |
| [0016](0016-dominance-and-alternatives.md)                       | The "better option" engine: Pareto dominance with indifference thresholds      | Accepted |
| [0017](0017-mortgage-refund-rules-engine.md)                     | The mortgage refund: rules as data, not as code                                | Accepted |

Template: [0000-template.md](0000-template.md)
