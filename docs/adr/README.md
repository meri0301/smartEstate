# Architecture Decision Records

One record per significant, hard-to-reverse decision, written in the Nygard format
(Context → Decision → Consequences). Records are immutable once accepted; a change of
direction is a new record that supersedes the old one.

| ID                                                      | Title                                                         | Status   |
| ------------------------------------------------------- | ------------------------------------------------------------- | -------- |
| [0001](0001-monorepo-with-pnpm-and-turborepo.md)        | Monorepo with pnpm workspaces and Turborepo                   | Accepted |
| [0002](0002-runtime-and-dependency-version-policy.md)   | Runtime and dependency version policy                         | Accepted |
| [0003](0003-docker-compose-as-deployment-target.md)     | Local Docker Compose as the only deployment target            | Accepted |
| [0004](0004-postgresql-postgis-pgvector-with-prisma.md) | PostgreSQL with PostGIS and pgvector, accessed through Prisma | Accepted |

Template: [0000-template.md](0000-template.md)
