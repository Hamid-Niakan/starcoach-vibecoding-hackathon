# Implementation Plan: Adopt Drizzle ORM

**Branch**: `002-adopt-drizzle-orm` | **Date**: 2026-08-20 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-adopt-drizzle-orm/spec.md`

## Summary

Establish Drizzle as the sole ORM for the shared NestJS API and declare PostgreSQL as its future dialect without introducing a database connection, runtime driver, credentials, schema, migrations, seeds, queries, or Nest database provider. The implementation adds `drizzle-orm` to the API runtime dependencies, `drizzle-kit` to its development dependencies, and an API-owned `drizzle.config.ts` containing only `dialect: "postgresql"`. A configuration-shape test and documentation enforce this deliberately narrow boundary.

This feature depends on the Monorepo foundation in `specs/001-monorepo-foundation` being implemented first. It does not scaffold the Monorepo itself.

## Technical Context

**Language/Version**: TypeScript in strict mode on the Node.js Active LTS release selected and pinned by feature 001

**Primary Dependencies**: Existing NestJS API foundation; `drizzle-orm` as an API runtime dependency; `drizzle-kit` as an API development dependency used only for typed configuration

**Storage**: No live storage in this feature; PostgreSQL is declared only as the future dialect

**Testing**: The test runner established by the NestJS scaffold; unit-level configuration-shape assertions plus existing root build, lint, format-check, type-check, and test gates

**Target Platform**: Node.js server runtime on the development and deployment platforms supported by feature 001

**Project Type**: pnpm/Turborepo Monorepo with two Nuxt frontends and one shared NestJS API; this feature changes only `apps/api` and repository documentation

**Performance Goals**: No runtime performance target because this feature creates no runtime database behavior; API startup and health behavior must remain unchanged

**Constraints**: No runtime PostgreSQL driver, connection, credentials, schema path, migration output, database command, seed, query, repository, Nest provider, or Drizzle dependency outside `apps/api`

**Scale/Scope**: Two API-scoped dependencies, one dialect-only configuration file, one focused test, and documentation updates; zero persistent entities and zero external contract changes

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

The constitution file is still an unratified placeholder and defines no enforceable project principles or governance gates. The following gates are therefore derived from the approved specifications:

- **Scope gate — PASS**: Design is configuration-only and excludes connectivity, drivers, credentials, schemas, migrations, seeds, and product behavior.
- **Boundary gate — PASS**: Drizzle ownership remains under `apps/api`; neither frontend nor either shared package depends on it.
- **Simplicity gate — PASS**: No shared database package, Nest module/provider, repository abstraction, or placeholder product schema is introduced.
- **Compatibility gate — PASS**: Existing health behavior and root quality tasks remain unchanged and database-independent.
- **Dependency gate — PASS**: Drizzle is the only ORM; Drizzle Kit is development-only and no PostgreSQL runtime driver or competing ORM is added.

**Post-design re-check**: PASS. Phase 1 introduces no persistent data model or new interface contract, and the quickstart validates every boundary above.

## Project Structure

### Documentation (this feature)

```text
specs/002-adopt-drizzle-orm/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
└── tasks.md                 # Created later by $speckit-tasks
```

No `contracts/` directory is created because this feature exposes no new HTTP, library, CLI, event, or data-exchange interface. The existing `GET /api/health` contract is unchanged and remains governed by feature 001.

### Source Code (repository root)

```text
apps/
├── api/
│   ├── drizzle.config.ts               # defineConfig({ dialect: "postgresql" }) only
│   ├── package.json                     # API-scoped Drizzle dependencies; no DB scripts
│   └── test/
│       └── drizzle-config.spec.ts       # Configuration shape and forbidden-field assertions
├── liara-docs/                          # Unchanged; no Drizzle dependency/import
└── zarinpal-dashboard/                  # Unchanged; no Drizzle dependency/import

packages/
├── shared-types/                        # Unchanged; framework/ORM independent
└── validation/                          # Unchanged; no Drizzle dependency/import

README.md                                # ORM choice, ownership, and deferred scope
```

**Structure Decision**: Keep both the dependency and configuration in `apps/api`, the only persistence owner. Do not create an empty `DatabaseModule`, injectable token, connection provider, schema directory, migration directory, or shared database package. A runtime Nest boundary will be introduced only when a later feature adds a real connection.

## Complexity Tracking

No constitution violation or justified complexity exception exists.
