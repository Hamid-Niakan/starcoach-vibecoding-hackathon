# Research: Adopt Drizzle ORM

## Decision 1: Keep Drizzle ownership inside `apps/api`

**Decision**: Declare `drizzle-orm` as a runtime dependency and `drizzle-kit` as a development dependency of `@hackathon/api`; add neither dependency to the repository root, frontends, `shared-types`, nor `validation`.

**Rationale**: The API is the sole persistence owner. API-local ownership prevents ORM types and operational concerns from leaking into framework-independent contracts or browser applications. Drizzle documents ORM and Kit as distinct runtime and development concerns, respectively. See the official [Drizzle Kit overview](https://orm.drizzle.team/docs/kit-overview).

**Alternatives considered**:

- Root-level dependencies: rejected because they obscure ownership and make accidental cross-workspace use easier.
- A new `packages/database` workspace: rejected as premature sharing when only one backend exists.
- `drizzle-kit` only: rejected because it would configure tooling without establishing Drizzle ORM as the selected API runtime ORM.

## Decision 2: Use a dialect-only Drizzle Kit configuration

**Decision**: Create `apps/api/drizzle.config.ts` using `defineConfig({ dialect: "postgresql" })`. Do not set `schema`, `out`, `dbCredentials`, `driver`, `migrations`, or environment imports.

**Rationale**: Drizzle's official configuration reference permits a dialect-only configuration. `schema` and `out` support schema/migration operations, while `dbCredentials` supports connection-requiring commands. Omitting those fields truthfully records the PostgreSQL choice without claiming a usable schema or database lifecycle. See the official [`drizzle.config.ts` reference](https://orm.drizzle.team/docs/drizzle-config-file).

**Alternatives considered**:

- Placeholder or empty schema path: rejected because it implies a schema workflow and creates a brittle or misleading command contract.
- Credentials or `DATABASE_URL`: rejected because no in-scope operation consumes them.
- No configuration file: rejected because a dependency and prose alone would not provide a type-checked, tool-recognized PostgreSQL declaration.

## Decision 3: Add no PostgreSQL runtime driver or connection provider

**Decision**: Do not install `pg`, `postgres`, `@types/pg`, `@neondatabase/serverless`, or another PostgreSQL connection driver. Do not call `drizzle(...)`, create a pool/client, add `DATABASE_URL`, or register a Nest provider/module.

**Rationale**: Drizzle's PostgreSQL guide introduces a database driver when initializing a real connection. Nest modules and providers represent runtime dependency-injection behavior. Both would exceed the configuration-only scope. See the official [Drizzle PostgreSQL guide](https://orm.drizzle.team/docs/get-started-postgresql) and NestJS documentation for [modules](https://docs.nestjs.com/modules) and [custom providers](https://docs.nestjs.com/fundamentals/custom-providers).

**Alternatives considered**:

- Initialize a driver without issuing queries: rejected because it still creates live connection machinery and credential requirements.
- Empty `DatabaseModule` or dummy provider: rejected because it falsely implies a usable runtime database service.
- Mock connection provider: rejected because there is no consumer or contract to mock.

## Decision 4: Expose no database commands yet

**Decision**: Add no `generate`, `migrate`, `push`, `pull`, `studio`, seed, or database lifecycle script to the API or root manifests.

**Rationale**: Schema generation requires an actual schema source, and connection-oriented commands require credentials. Advertising commands that cannot validly run would violate the specification's explicit deferral. The configuration is validated by type checking and a focused unit test instead. See the official [Drizzle Kit generate documentation](https://orm.drizzle.team/docs/drizzle-kit-generate).

**Alternatives considered**:

- Add future-facing scripts that currently fail: rejected because root tasks and documented workflows must be executable.
- Add a placeholder schema solely to make generation run: rejected as speculative persistent design.

## Decision 5: Validate positive configuration and negative boundaries

**Decision**: Import the configuration in an API test, assert `dialect === "postgresql"`, and assert that connection/schema/migration fields are absent. Complement that test with manifest inspection, repository boundary checks, the existing quality tasks, credential-free API startup, and the unchanged health response.

**Rationale**: The primary behavior of this feature is architectural constraint. Both the intended declaration and absence of forbidden runtime artifacts must be verifiable.

**Alternatives considered**:

- Run a migration command: rejected because there is no schema or migration workflow.
- Connect to a test database: rejected because connectivity is explicitly out of scope.
- Documentation-only validation: rejected because it would not prove the typed configuration is loadable.

## Version Policy

Resolve current compatible stable package versions during implementation and pin them through the pnpm lockfile and repository dependency conventions. Do not hard-code prerelease tags in the plan; official pages may show release-candidate examples for newly released capabilities, while this feature requires compatible stable packages.
