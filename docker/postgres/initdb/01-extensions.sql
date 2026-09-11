-- Executed once by the postgres entrypoint when the data volume is empty.
-- Prisma migrations assume these extensions exist; installing them here keeps
-- `docker compose up` a single step with no manual SQL.
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS vector;
