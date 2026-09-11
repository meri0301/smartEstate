# PostgreSQL 16 with both vector-similarity (pgvector) and geospatial (PostGIS)
# extensions. No single official image ships both.
#
# Base choice: the pgvector image tracks the current Debian stable (bookworm),
# whereas postgis/postgis:16-3.5 is still built on bullseye, whose security
# repository reached end-of-life on 2026-08-31 and now fails `apt-get update`.
# PostGIS is installed from the PGDG apt repository the base image already trusts.
FROM pgvector/pgvector:pg16

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      postgresql-16-postgis-3 \
      postgresql-16-postgis-3-scripts \
 && rm -rf /var/lib/apt/lists/*
