# 0003 — Local Docker Compose as the only deployment target

**Status:** Accepted
**Date:** 2026-09-11

## Context

The thesis defence is a live demonstration on the author's machine. Hosted deployment was
explicitly ruled out of scope. The system nevertheless depends on stateful services with
native extensions (PostgreSQL with PostGIS and pgvector, Redis) and on a Python runtime with
a machine-learning stack, none of which should require manual installation by an examiner
who wants to reproduce the results.

## Decision

`docker compose up` is the single supported way to run infrastructure, and eventually all
services. Requirements the compose setup must keep meeting as the project grows:

- **One command, no manual steps.** Extensions are created by an init script on first
  start; database migrations and seeding will run automatically from the API container
  when those exist. There is never a "then run this SQL" step.
- **Health checks on every service** and `--wait` on start-up, so a green `docker compose up`
  means the stack is genuinely usable, not merely started.
- **A documented reset** (`pnpm docker:reset`) that destroys volumes and rebuilds from
  scratch, guaranteeing a reproducible demo state.
- **A purpose-built Postgres image** (`docker/postgres/Dockerfile`) layering PostGIS onto
  the pgvector image, because no official image provides both extensions. The pgvector
  image was chosen as the base because it tracks current Debian stable; the PostGIS image
  was still built on Debian bullseye, whose security repository went end-of-life on
  2026-08-31 and now fails `apt-get update`.

Alternatives considered: a hosted PaaS (out of scope, costs money, adds secrets management),
Kubernetes via kind/minikube (far more machinery than a single-node demo justifies), and
native installation of Postgres/Redis (irreproducible across machines).

## Consequences

- Docker Desktop (or an equivalent engine) is the only hard prerequisite besides Node.
- The CI `infra` job boots the same compose file on every pull request and asserts that
  PostGIS and pgvector are installed, so the demo environment is continuously verified.
- Application containers for `api`, `web` and `ml` are added to the compose file as those
  apps gain real behaviour (Phase 2 onwards); Phase 0 ships infrastructure only.
- Performance numbers reported in the thesis are measured on this single-machine setup and
  must be labelled as such.
