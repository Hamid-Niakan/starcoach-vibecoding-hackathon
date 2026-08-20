# Feature Specification: Monorepo Foundation

**Feature Branch**: `codex/monorepo-foundation`
**Created**: 2026-08-20
**Status**: Approved
**Input**: Establish a reproducible monorepo for the Liara documentation assistant and ZarinPal analytics product.

## Clarifications

### Session 2026-08-20

- Both frontends use Next.js and React; the existing Liara documentation is imported, not rewritten.
- The first milestone retains Next.js 14 locally, with public deployment blocked until feature 005 upgrades it.
- The repository has three independent deployables: Liara web, ZarinPal web, and one shared API.
- The Liara source is imported as a pinned, squashed upstream snapshot.
- Product chrome is Persian-first with correct LTR treatment for code and technical content.

## User Scenarios & Testing

### User Story 1 - Join the Project from a Clean Clone (Priority: P1)

As a teammate, I can install one pinned toolchain and use root commands so I can contribute without reconstructing local setup.

**Independent Test**: A clean clone installs from the root and discovers all applications and shared packages.

**Acceptance Scenarios**:

1. **Given** the documented prerequisites, **When** a teammate installs dependencies, **Then** the frozen lockfile resolves every workspace.
2. **Given** an installed workspace, **When** root quality commands run, **Then** applicable workspaces build, lint, type-check, format-check, and test.
3. **Given** a workspace filter, **When** a command runs, **Then** only the selected workspace and required dependencies execute.

### User Story 2 - Develop Each Product Independently (Priority: P2)

As a product developer, I can run either frontend or the API without starting unrelated applications.

**Independent Test**: Each application starts and builds independently.

**Acceptance Scenarios**:

1. **Given** the Liara workspace, **When** it starts, **Then** representative imported documentation routes and assets render.
2. **Given** the ZarinPal workspace, **When** it starts, **Then** a responsive Persian dashboard shell with a shadcn-style button renders.
3. **Given** the API workspace, **When** it starts, **Then** `GET /api/health` returns HTTP 200 and exactly `{"status":"ok"}`.

### User Story 3 - Build and Containerize Stable Boundaries (Priority: P3)

As a maintainer, I can understand dependency and deployment boundaries so later features do not couple the products.

**Independent Test**: The dependency graph is acyclic and every deployable has a production image definition.

**Acceptance Scenarios**:

1. **Given** the workspace graph, **When** inspected, **Then** applications depend only on public shared-package exports and packages never depend on applications.
2. **Given** Docker, **When** each application image is built, **Then** it contains only the files required for that deployable.
3. **Given** the root Compose file, **When** validated, **Then** it defines both frontends, the API, PostgreSQL, health dependencies, and persistent data volumes.

### Edge Cases

- A missing optional Meilisearch service must not prevent the imported docs site from rendering.
- Imported legacy JavaScript may remain, but new or materially modified source must use strict TypeScript.
- Code, URLs, and identifiers must remain readable LTR inside RTL layouts.
- Root task orchestration must tolerate workspaces that do not implement a non-applicable task.
- Public deployment documentation must visibly fail its release gate while Next.js 14 is installed.

## Requirements

### Functional Requirements

- **FR-001**: The repository MUST contain `apps/liara-docs`, `apps/zarin-dashboard`, and `apps/api`.
- **FR-002**: It MUST contain `packages/contracts`, `packages/api-client`, and `packages/chat-ui` with names under `@hackathon/*`.
- **FR-003**: pnpm workspaces and Turborepo MUST provide root `dev`, `build`, `lint`, `format`, `format:check`, `type-check`, and `test` commands.
- **FR-004**: The root MUST pin an exact pnpm release, declare Node.js 24, and commit the generated lockfile.
- **FR-005**: The Liara application MUST be a pinned squashed snapshot of `liara-cloud/docs`, with attribution and update instructions.
- **FR-006**: The imported Liara application MUST retain its documentation routes, MDX content, assets, and existing visual design.
- **FR-007**: The ZarinPal application MUST use Next.js, React, Tailwind, and shadcn/ui conventions and render a responsive Persian-first shell.
- **FR-008**: Both frontends MUST use Next.js 14 and React 18 only as a temporary local baseline.
- **FR-009**: The NestJS API MUST define `chat`, `liara`, `zarinpal`, `persistence`, `analytics`, `health`, and `observability` module boundaries.
- **FR-010**: `GET /api/health` MUST return HTTP 200 and exactly `{"status":"ok"}` without external dependencies.
- **FR-011**: Shared packages MUST be framework-independent except `chat-ui`, which MAY depend on React 18.
- **FR-012**: Applications MAY depend on packages; packages MUST NOT depend on applications; circular dependencies are forbidden.
- **FR-013**: Root documentation MUST cover clean-clone setup, workspace filters, environment setup, subtree updates, containers, and troubleshooting.
- **FR-014**: The repository MUST provide one root Compose definition plus independent Liara, ZarinPal, and API deployment overlays.
- **FR-015**: Raw ZarinPal data, DuckDB files, secrets, caches, and build output MUST be ignored by Git and Docker contexts.
- **FR-016**: No real model, RAG, analytics insight, authentication, or product database schema MUST be implemented in this feature.
- **FR-017**: No CI workflow MUST be added in this milestone.
- **FR-018**: A release check MUST fail while either frontend uses Next.js 14.

### Key Entities

- **Workspace**: An independently addressable application or package with public scripts and dependencies.
- **Deployable**: Liara web, ZarinPal web, or shared API, each with a production image boundary.
- **Upstream Snapshot**: The exact Liara source repository and commit represented in the monorepo.
- **Release Gate**: A deterministic check that prevents unsupported frontend versions from being treated as deployable.

## Success Criteria

- **SC-001**: A teammate can install and start any application from a clean clone in under 10 minutes using only the README.
- **SC-002**: All three applications build independently and all terminating root checks pass.
- **SC-003**: Representative Liara documentation routes and the ZarinPal shell render on desktop and mobile widths.
- **SC-004**: Repository inspection reports zero dependency cycles and zero application imports from another application.
- **SC-005**: Docker Compose configuration validates for the full stack and all three independent overlays.
- **SC-006**: The API health contract passes without database credentials or network access.
- **SC-007**: The release gate reports Next.js 14 as blocked rather than deployable.

## Assumptions

- Node.js 24 is the Active LTS line at implementation time.
- Imported source provenance is recorded even if the upstream repository does not publish a conventional license file.
- Database runtime behavior and chat behavior are delivered by features 003 and 004.

## Out of Scope

- Real AI providers, document ingestion, embeddings, retrieval, citations, and evaluations
- ZarinPal dataset ingestion, metrics, charts, and merchant insights
- Authentication, authorization, CI/CD, and public deployment
- Live PostgreSQL and DuckDB usage beyond Compose volume placeholders
