# Quickstart: Data Platform Foundation

Start PostgreSQL with `docker compose up -d postgres`, set `DATABASE_URL`, run `pnpm --filter @hackathon/api db:migrate`, start the API, and request `/api/health/ready`. Expect `status=ready`, `postgres=true`, and `duckdb=true`. Stop PostgreSQL and confirm `/api/health` remains 200 while readiness degrades.
