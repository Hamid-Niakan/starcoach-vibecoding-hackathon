# Research: Data Platform Foundation

- **PostgreSQL driver**: `postgres.js`, supported directly by Drizzle and small enough for the shared API.
- **DuckDB client**: official Node Neo `@duckdb/node-api`, because the legacy `duckdb` client is deprecated.
- **Startup policy**: report degraded readiness instead of terminating, preserving liveness and diagnosability.
