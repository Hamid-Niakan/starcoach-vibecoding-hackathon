---

description: "Dependency-ordered tasks for the Drizzle ORM configuration foundation"
---

# Tasks: Adopt Drizzle ORM

**Input**: Design documents from `/specs/002-adopt-drizzle-orm/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, and `quickstart.md`; the Monorepo foundation from `specs/001-monorepo-foundation` must already be implemented

**Tests**: Included because FR-005, FR-007, SC-002, SC-005, SC-006, and the approved plan require configuration-shape and regression validation.

**Organization**: Tasks are grouped by user story so the sole-ORM decision and PostgreSQL configuration boundary remain independently testable.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel because it affects different files and has no dependency on an incomplete task
- **[Story]**: Maps the task to a user story from `spec.md`
- Every task names the exact file or path it validates or changes

## Phase 1: Setup (Prerequisite Verification)

**Purpose**: Confirm that feature 001 has produced the workspace in which this feature is allowed to operate

- [ ] T001 Verify that the feature 001 scaffold exists with `apps/api/package.json`, `apps/api/src/`, `apps/api/test/`, root `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `pnpm-lock.yaml`, and `README.md`; stop and implement `specs/001-monorepo-foundation` first if any prerequisite is missing

---

## Phase 2: Foundational (Blocking Baseline)

**Purpose**: Establish the existing API test and package conventions before writing story-specific tests

**⚠️ CRITICAL**: User-story work starts only after the API scaffold and its baseline checks are confirmed healthy.

- [ ] T002 Run the existing API test and type-check scripts declared in `apps/api/package.json`, inspect all workspace `package.json` files for pre-existing ORM or PostgreSQL-driver dependencies, and resolve any conflict with FR-001–FR-003 before continuing

**Checkpoint**: The API scaffold is healthy and contains no conflicting persistence choice.

---

## Phase 3: User Story 1 - Use One Approved Data-Access Standard (Priority: P1) 🎯 MVP

**Goal**: Make Drizzle the sole API-owned ORM while preserving all workspace boundaries.

**Independent Test**: Inspect workspace manifests and documentation, then run the API tests; only `@hackathon/api` declares Drizzle, Drizzle Kit is development-only, no competing ORM or PostgreSQL runtime driver exists, and shared packages/frontends remain Drizzle-free.

### Tests for User Story 1

> Write T003 first and confirm it fails because the expected Drizzle dependencies are not yet declared; T004 makes it pass.

- [ ] T003 [P] [US1] Add a repository-boundary test that asserts `drizzle-orm` is declared only in `apps/api/package.json`, `drizzle-kit` is an API dev dependency, forbidden competing ORMs/runtime PostgreSQL drivers are absent from every workspace manifest, and no database lifecycle script exists in `apps/api/test/drizzle-boundary.spec.ts`

### Implementation for User Story 1

- [ ] T004 [P] [US1] Add compatible stable `drizzle-orm` and development-only `drizzle-kit` dependencies to `apps/api/package.json` and update `pnpm-lock.yaml` without adding a PostgreSQL driver, competing ORM, or database script
- [ ] T005 [US1] Document Drizzle as the sole ORM, identify `apps/api` as its owner, and prohibit Drizzle imports/dependencies in frontends and shared packages in `README.md`

**Checkpoint**: User Story 1 is complete when `apps/api/test/drizzle-boundary.spec.ts` passes and repository inspection finds exactly one API-owned ORM.

---

## Phase 4: User Story 2 - Prepare Future PostgreSQL Work (Priority: P2)

**Goal**: Declare PostgreSQL through a type-safe Drizzle configuration while keeping all connection and persistence lifecycle behavior deferred.

**Independent Test**: Load the Drizzle configuration without environment variables or a database; it reports only the PostgreSQL dialect and contains no schema, output, credentials, driver, migration settings, client, provider, or runtime behavior.

### Tests for User Story 2

> Write T006 first and confirm it fails because `apps/api/drizzle.config.ts` does not yet exist; T007 makes it pass.

- [ ] T006 [P] [US2] Add a configuration-shape test asserting `dialect === "postgresql"` and absence of `schema`, `out`, `dbCredentials`, `driver`, and `migrations` in `apps/api/test/drizzle-config.spec.ts`

### Implementation for User Story 2

- [ ] T007 [P] [US2] Create the API-owned dialect-only configuration with `defineConfig({ dialect: "postgresql" })` and no environment import or additional configuration fields in `apps/api/drizzle.config.ts`
- [ ] T008 [US2] Extend `README.md` with the PostgreSQL target and explicitly defer runtime drivers, `DATABASE_URL`, connections, Nest database modules/providers, schemas, migrations, seeds, queries, and repositories

**Checkpoint**: User Story 2 is complete when the configuration test passes without credentials or PostgreSQL and the documented deferred boundary is unambiguous.

---

## Phase 5: Polish & Cross-Cutting Validation

**Purpose**: Prove that both stories integrate without scope leakage or regression.

- [ ] T009 [P] Inspect `apps/`, `packages/`, every workspace `package.json`, `pnpm-lock.yaml`, and the implementation diff to confirm zero schema/migration/seed artifacts, zero database environment requirements, zero connection initialization, zero Nest database providers, and zero Drizzle leakage outside `apps/api`
- [ ] T010 Run `pnpm build`, `pnpm lint`, `pnpm format:check`, `pnpm type-check`, and `pnpm test` from the repository root and resolve failures only within files changed by this feature, following `specs/002-adopt-drizzle-orm/quickstart.md`
- [ ] T011 Start the API without database environment variables and verify HTTP 200 with exact body `{"status":"ok"}` from `GET /api/health`, then complete the documentation review and acceptance summary in `specs/002-adopt-drizzle-orm/quickstart.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: Requires feature 001 to have been implemented; T001 is a hard stop if its scaffold is absent.
- **Foundational (Phase 2)**: Depends on T001 and blocks all story work.
- **User Story 1 (Phase 3)**: Depends on T002 and delivers the MVP ORM ownership decision.
- **User Story 2 (Phase 4)**: Depends on T002. It can begin alongside User Story 1, but final package-level validation requires T004.
- **Polish (Phase 5)**: Depends on all tasks for the stories selected for delivery.

### User Story Dependencies

- **User Story 1 (P1)**: Starts after T002 and has no dependency on User Story 2.
- **User Story 2 (P2)**: Starts after T002 and is independently testable through the dialect-only configuration; its test runtime requires `drizzle-kit` from T004 before final execution.

### Within Each User Story

- Write and observe the specified failing test before its implementation task.
- T003 precedes T004; T004 must make T003 pass before T005 closes User Story 1.
- T006 precedes T007; T007 must make T006 pass before T008 closes User Story 2.
- Do not introduce any connection/schema artifact to make a test pass.

### Parallel Opportunities

- After T002, T003 and T006 can be authored in parallel because they target different test files.
- After their tests exist, T004 and T007 can run in parallel because they modify different files.
- T009 can begin after T004 and T007 while documentation is finalized, but its final pass must occur after T005 and T008.
- T010 and T011 are sequential final validations because T011 requires a long-running API process after terminating quality gates pass.

---

## Parallel Example: User Stories 1 and 2

```text
Task: "Add ORM ownership and dependency boundary assertions in apps/api/test/drizzle-boundary.spec.ts"
Task: "Add PostgreSQL dialect-only configuration assertions in apps/api/test/drizzle-config.spec.ts"

Then, after both tests fail for their expected reasons:

Task: "Add Drizzle dependencies in apps/api/package.json and pnpm-lock.yaml"
Task: "Create the dialect-only apps/api/drizzle.config.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Verify feature 001 through T001.
2. Complete the baseline gate in T002.
3. Write the failing boundary test in T003.
4. Add only the approved dependencies in T004.
5. Document ownership in T005.
6. Stop and independently validate User Story 1 before adding PostgreSQL configuration.

### Incremental Delivery

1. Setup + foundational verification establishes a safe baseline.
2. User Story 1 selects and scopes Drizzle as the sole ORM.
3. User Story 2 adds the PostgreSQL dialect declaration without runtime persistence.
4. Cross-cutting validation proves there is no scope leakage and the health endpoint remains unchanged.

### Parallel Team Strategy

After T002, one developer may author the User Story 1 boundary test while another authors the User Story 2 configuration test. Dependency installation and configuration creation can then proceed in parallel, followed by coordinated README updates and final validation.

## Notes

- `[P]` means the task targets files that do not conflict with another incomplete task.
- `[US1]` and `[US2]` provide traceability to the specification's user stories.
- No task may add a runtime PostgreSQL driver, credential contract, connection, schema, migration, seed, query, repository, or Nest database provider.
- No `contracts/` task exists because this feature changes no external interface.
- Commit after each task or logical group and stop at each checkpoint for independent validation.
