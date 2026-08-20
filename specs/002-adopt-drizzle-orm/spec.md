# Feature Specification: Adopt Drizzle ORM

**Feature Branch**: `N/A (no branch hook is configured)`

**Created**: 2026-08-20

**Status**: Draft — clarified and ready for planning

**Input**: Use Drizzle as the project's ORM.

## Clarifications

### Session 2026-08-20

- Q: How far should Drizzle adoption go in this feature? → A: Configuration foundation only; do not add a live PostgreSQL connection, migration workflow, or schema.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Use One Approved Data-Access Standard (Priority: P1)

As a backend developer, I want Drizzle to be the single approved ORM so that future persistence work follows one type-safe and maintainable convention.

**Why this priority**: Selecting one ORM early prevents competing persistence patterns and avoids migration work after product development begins.

**Independent Test**: The backend's persistence boundary and project documentation identify Drizzle as the only ORM, and no competing ORM is present.

**Acceptance Scenarios**:

1. **Given** the Monorepo foundation, **When** a developer inspects the backend's persistence conventions, **Then** Drizzle is identified as the sole ORM.
2. **Given** a clean checkout, **When** the repository quality checks run, **Then** the Drizzle foundation is type-safe and does not break existing applications.

---

### User Story 2 - Prepare Future PostgreSQL Work (Priority: P2)

As a backend developer, I want the ORM boundary to be compatible with the planned PostgreSQL data store so that future schemas and queries can be added without replacing the data-access foundation.

**Why this priority**: The existing product direction names PostgreSQL as the future primary database, so the ORM decision must preserve that path.

**Independent Test**: The declared ORM target is PostgreSQL and its type-safe foundation can be loaded independently from product modules without credentials, a live database, migrations, or product entities.

**Acceptance Scenarios**:

1. **Given** the ORM foundation, **When** its database target is inspected, **Then** it is configured exclusively for PostgreSQL.
2. **Given** no product schema has been approved, **When** the foundation is validated, **Then** no connection, migration, table, or speculative domain model exists.

### Edge Cases

- The configuration foundation must not attempt a connection or require database credentials during application startup, build, or quality tasks.
- Drizzle-specific types must not leak into framework-independent shared contracts unless explicitly required by a future feature.
- The ORM foundation must not introduce a second validation or domain-contract source that conflicts with the existing shared packages.
- No destructive migration or schema reset may run automatically during application startup or ordinary development tasks.
- Adding the ORM must not make the existing health endpoint depend on database availability unless a later specification explicitly changes its contract.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Drizzle MUST be the only ORM approved and configured for backend persistence.
- **FR-002**: The ORM foundation MUST target PostgreSQL, consistent with the previously stated product direction.
- **FR-003**: The repository MUST NOT include another ORM or an alternative application-level persistence abstraction that competes with Drizzle.
- **FR-004**: Drizzle integration MUST remain inside the backend persistence boundary and MUST NOT make `shared-types` dependent on Drizzle, NestJS, or database drivers.
- **FR-005**: The integration MUST preserve strict type checking and MUST pass the repository's existing build, lint, format-check, type-check, and test tasks.
- **FR-006**: This feature MUST NOT require database credentials or add a live database connection; application startup, build, and quality tasks MUST remain database-independent.
- **FR-007**: The existing `GET /api/health` contract MUST remain independent of database availability and MUST continue to return its previously specified response.
- **FR-008**: No Zarinpal, Liara, chatbot, authentication, payment, analytics, or other product-specific table MUST be invented as part of ORM adoption.
- **FR-009**: This feature MUST NOT add a migration workflow, migration file, schema definition, seed data, or automatic migration behavior.
- **FR-010**: Delivery MUST be limited to establishing Drizzle as the approved, type-safe PostgreSQL ORM and configuration foundation; live connectivity, database drivers used for runtime connections, migration workflows, and schemas are deferred to later specifications.
- **FR-011**: Documentation MUST explain the approved ORM, its PostgreSQL target, the configuration-only boundary, and the explicitly deferred connection, migration, and schema work.
- **FR-012**: No frontend application MUST depend directly on the database driver or backend-only Drizzle configuration.

### Key Entities

- **ORM Foundation**: The approved data-access boundary, configuration, and conventions through which future backend persistence features will use Drizzle.
- **Database Configuration**: Non-secret settings and environment-variable contracts needed to target PostgreSQL.
- **Deferred Persistence Lifecycle**: Future live connections, migrations, schema definitions, and seed data that require separate specifications and are not delivered by this feature.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Repository inspection finds exactly one approved ORM and zero competing ORM dependencies.
- **SC-002**: All existing terminating root quality tasks complete successfully after adoption.
- **SC-003**: A new backend developer can identify the ORM choice, its PostgreSQL target, and the configuration-only boundary—including deferred connection, migration, and schema work—from repository documentation in under 10 minutes.
- **SC-004**: Scope review finds zero speculative product tables and zero database dependencies in frontend or framework-independent shared packages.
- **SC-005**: Starting the API without database credentials does not attempt a database connection and does not alter or break the established health endpoint contract.
- **SC-006**: Repository inspection finds zero migration files, zero schema definitions, and zero migration execution paths introduced by this feature.

## Assumptions

- PostgreSQL is the intended primary database because it was explicitly identified in the Monorepo foundation request; DuckDB remains a separate future analytical concern and is not managed through this ORM decision.
- Drizzle refers to Drizzle ORM. Exact packages and versions required for a configuration-only foundation are selected during planning and pinned by the workspace lockfile; unnecessary runtime database or migration dependencies are excluded.
- The backend owns persistence. Frontends consume backend contracts and do not connect to PostgreSQL directly.
- Product entities, retention rules, indexing, analytics models, and transaction workflows require separate feature specifications.
- The existing Monorepo foundation specification remains authoritative wherever this feature does not explicitly extend it.

## Out of Scope

- Product-specific tables, queries, repositories, or seed data
- Live PostgreSQL connections, runtime connection drivers, migrations, and schema definitions
- Zarinpal transaction models or analytics pipelines
- Liara document ingestion, embeddings, or RAG storage
- DuckDB integration
- Authentication and authorization persistence
- Production database provisioning, backups, replication, or monitoring
- Changes to the public health endpoint contract
