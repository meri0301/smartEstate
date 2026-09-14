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

Template: [0000-template.md](0000-template.md)
