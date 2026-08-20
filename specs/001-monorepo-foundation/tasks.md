# Tasks: Monorepo Foundation

## Phase 1: Setup

- [ ] T001 Create root pnpm/Turborepo/toolchain configuration and ignore files in `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `.nvmrc`, `.gitignore`, and `.dockerignore`
- [ ] T002 Import the pinned Liara upstream snapshot into `apps/liara-docs` and record provenance in `docs/architecture/liara-upstream.md`
- [ ] T003 Scaffold `apps/zarin-dashboard`, `apps/api`, and the three `packages/*` workspaces

## Phase 2: Foundational

- [ ] T004 Configure public entrypoints, strict TypeScript, and one-directional workspace dependencies across all manifests
- [ ] T005 Add shared root lint, formatting, type-check, test, and build orchestration

## Phase 3: User Story 1 - Clean Clone (P1)

- [ ] T006 [US1] Add toolchain, install, filtering, and troubleshooting instructions to `README.md` and `CONTRIBUTING.md`
- [ ] T007 [US1] Generate and validate the committed `pnpm-lock.yaml`

## Phase 4: User Story 2 - Independent Applications (P2)

- [ ] T008 [P] [US2] Adapt `apps/liara-docs/package.json` and configuration to the root workspace while preserving imported routes and assets
- [ ] T009 [P] [US2] Implement the Persian-first shadcn-style shell in `apps/zarin-dashboard`
- [ ] T010 [P] [US2] Implement NestJS module boundaries and exact health contract in `apps/api`

## Phase 5: User Story 3 - Deployment Boundaries (P3)

- [ ] T011 [P] [US3] Add production Dockerfiles for all applications
- [ ] T012 [US3] Add root `compose.yaml` and independent files in `deploy/`
- [ ] T013 [P] [US3] Add the unsupported Next.js release gate in `scripts/check-release.mjs`

## Phase 6: Polish and Validation

- [ ] T014 Add challenge briefs, architecture notes, environment examples, and ZarinPal data conventions under `docs/`, `.env.example`, and `data/zarinpal/README.md`
- [ ] T015 Run root checks, application builds, health tests, and Compose validation; record completion in this file
