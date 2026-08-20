# Implementation Plan: Data Platform Foundation

Use `drizzle-orm/postgres-js` with a five-connection pool and committed SQL migration under `apps/api/drizzle`. Initialize through a global Nest persistence service with five-second connection timeout and graceful shutdown. Use `@duckdb/node-api` behind a global analytics service, defaulting to in-memory when no path is configured. `/api/health/ready` requires both stores; `/api/health` and `/live` do not.

## Constitution Check

PASS: storage is API-owned, secrets are runtime-only, raw input is read-only, and no analytical claims or speculative dataset schema are introduced.
