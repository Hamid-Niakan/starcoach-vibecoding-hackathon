# Data Model: Drizzle ORM Foundation

This feature creates no persisted domain model. This document records architectural concepts and constraints only; it is not a schema, migration, or runtime connection design.

## Persistent Data Model

None. No tables, columns, relations, indexes, enums, views, migrations, seed records, repositories, or queries are introduced. PostgreSQL is only the declared future target.

## Architectural Concepts

### ORM Foundation

- **Approved ORM**: Drizzle ORM
- **Database target**: PostgreSQL
- **Owner**: `apps/api`
- **Mode**: Configuration-only
- **Exclusivity**: Sole approved ORM
- **Validation rules**:
  - `drizzle-orm` exists only in the API workspace.
  - `drizzle-kit` is development-only in the API workspace.
  - No competing ORM dependency or abstraction is introduced.
  - The foundation loads and type-checks without credentials or a database.

### Persistence Boundary

- **Location**: `apps/api`
- **Permitted consumers**: Future API persistence capabilities approved by later specifications
- **Forbidden consumers**: `apps/liara-docs`, `apps/zarinpal-dashboard`, `packages/shared-types`, and `packages/validation`
- **Validation rules**:
  - Frontends and shared packages contain no Drizzle or database-driver dependency/import.
  - Drizzle types do not leak into shared or HTTP contracts.
  - No Nest runtime provider is exposed in this feature.

### Drizzle Configuration

- **Location**: `apps/api/drizzle.config.ts`
- **Required field**: `dialect: "postgresql"`
- **Forbidden fields in this feature**: `schema`, `out`, `dbCredentials`, `driver`, and `migrations`
- **Forbidden behavior**: Loading environment credentials, creating a client, connecting, querying, generating artifacts, or executing migrations

### Deferred Persistence Lifecycle

- **Members**: Live connection, PostgreSQL runtime driver, credentials, schema definitions, migrations, seed data, queries, and repositories
- **Validation rule**: None may be introduced by this feature; each requires a later specification.

## Relationships

- The API persistence boundary owns the ORM foundation and Drizzle configuration.
- The ORM foundation declares PostgreSQL as the future database target.
- The deferred persistence lifecycle may extend the foundation later but is not implemented now.
- Product modules may consume persistence capabilities only after separately specified work introduces them.

## State Transitions

No runtime entity lifecycle exists. The only architectural transition is from `configuration-only` to `connected persistence`; that transition is prohibited in this feature and gated by a future specification. Existing health behavior remains database-independent.

## Environment and Secret Model

No database environment variable, credential, or secret is required or consumed. Do not add `DATABASE_URL` as a placeholder. A later connectivity feature must define its environment contract, validation, and security rules.
