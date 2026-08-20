# Feature Specification: Data Platform Foundation

**Created**: 2026-08-20 | **Status**: Approved

## User Scenarios & Testing

### User Story 1 - Persist Transactional State (Priority: P1)
As an API developer, I can use one PostgreSQL/Drizzle boundary with deterministic migrations.

**Acceptance**: Starting against an empty PostgreSQL database applies the committed migration and passes a query; liveness remains independent if PostgreSQL is absent.

### User Story 2 - Prepare Analytical Queries (Priority: P2)
As an analytics developer, I can use one API-owned DuckDB adapter and validate it without inventing dataset tables.

**Acceptance**: DuckDB opens the configured file or in-memory database and completes a smoke query.

## Requirements

- PostgreSQL MUST use Drizzle and `postgres.js`; no competing ORM is allowed.
- Migrations MUST create only generic conversation/message state required by feature 004.
- DuckDB MUST use the official Node Neo API behind `AnalyticsModule`.
- Raw ZarinPal input MUST be mounted read-only and generated database files MUST be ignored.
- Readiness MUST report PostgreSQL and DuckDB separately; liveness MUST remain storage-independent.

## Success Criteria

- Empty-database migration and restart are idempotent.
- DuckDB completes `SELECT 42` on every supported development/container platform.
- Storage credentials, raw data, and local database files are absent from Git.
