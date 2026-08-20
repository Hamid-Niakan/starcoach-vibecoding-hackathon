<!--
Sync Impact Report
- Version change: unratified template -> 1.0.0
- Added principles: Spec-Driven Delivery; Independent Product Boundaries; Evidence and
  Traceability; Security, Reliability, and Cost; Reproducible Team Development;
  Persian-First Accessible UX
- Added sections: Architecture and Data Constraints; Delivery Workflow and Quality Gates
- Removed sections: none
- Follow-up TODOs: none
-->
# Hackathon Products Constitution

## Core Principles

### I. Spec-Driven Delivery (NON-NEGOTIABLE)
Every product capability MUST begin with a testable specification and MUST progress through
research, design contracts, an implementation plan, dependency-ordered tasks, and verified
implementation. Product behavior MUST NOT be invented inside implementation tasks. Changes that
alter user value, public contracts, data meaning, privacy, or deployment boundaries require the
active specification to be amended before code changes continue.

### II. Independent Product Boundaries
Liara Docs, ZarinPal Dashboard, and the shared API MUST remain independently buildable,
testable, and deployable. Applications MAY depend on versioned public APIs from shared packages;
shared packages MUST NOT depend on applications. Product modules MUST not access another
product's conversations, data, or private services. Shared code exists only for demonstrated
cross-product behavior and MUST preserve product-specific policy boundaries.

### III. Evidence and Traceability
Every AI answer and analytical claim MUST be traceable to its inputs and calculation or retrieval
method. Liara answers MUST expose suitable documentation sources and avoid unsupported claims.
ZarinPal figures MUST be derived from the supplied attempt-level dataset and MUST make source
rows, filters, aggregation rules, and missing-value treatment inspectable. `adjusted_fee` MUST be
described only as an adjusted comparative metric, never as ZarinPal's actual fee.

### IV. Security, Reliability, and Cost
Secrets MUST enter through validated runtime configuration and MUST never be committed, logged,
or sent to browsers. Public inputs MUST be validated, bounded, rate-limited, and safe to retry.
Logs MUST be structured and redact message bodies, credentials, and merchant data. External
calls MUST have timeouts, cancellation, explicit failure states, and measured token or query cost.
The simplest model and data path that meets evaluated quality targets MUST be preferred.

### V. Reproducible Team Development
A clean clone MUST be runnable from documented commands with an exact package manager, committed
lockfile, declared Node.js release line, example environment file, and deterministic migrations.
Root tasks MUST cover build, lint, formatting, type checking, and tests, and MUST be filterable by
workspace. Generated data, secrets, local databases, caches, and raw merchant datasets MUST remain
outside version control. Upstream vendored sources MUST record provenance and update procedure.

### VI. Persian-First Accessible UX
Product chrome MUST be understandable to Persian-speaking non-technical users and MUST support
responsive mobile and desktop use. Directionality MUST be explicit: Persian prose uses RTL while
code, URLs, identifiers, and suitable technical passages use isolated LTR presentation. Keyboard
operation, visible focus, semantic structure, readable contrast, loading states, empty states, and
recoverable errors are acceptance requirements rather than optional polish.

## Architecture and Data Constraints

- The workspace uses pnpm and Turborepo with applications in `apps/` and reusable packages in
  `packages/`; internal package names use the `@hackathon/*` scope.
- Frontends use Next.js and React. The shared backend uses NestJS. PostgreSQL is the transactional
  store managed through Drizzle, while DuckDB is an API-owned analytical engine and is not managed
  through the ORM.
- The official ZarinPal dataset is read-only input. Raw input and derived DuckDB files MUST be
  gitignored; tracked metadata MUST include source identity and integrity information.
- Public interface changes require versioned schemas in the contracts package and contract tests
  in every producer and consumer affected by the change.
- A framework version without security support MUST NOT be publicly deployed. Temporary legacy
  versions MAY be used only behind an explicit release-blocking upgrade task.

## Delivery Workflow and Quality Gates

1. Select exactly one active Spec Kit feature and point `.specify/feature.json` to it.
2. Complete specification quality checks and resolve all material clarifications.
3. Complete research, data model, public contracts, quickstart, plan, and tasks before implementation.
4. Implement tasks in dependency order and mark them complete only after their acceptance checks pass.
5. Run affected workspace checks continuously and all terminating root checks before feature closure.
6. Validate production images and Compose configuration for deployment-related changes.
7. Document deferred risks and prevent release when a required security, data, or traceability gate fails.

Reviewers MUST reject undocumented scope expansion, untraceable metrics, cross-product data access,
unbounded AI/data operations, leaked secrets, or changes that cannot be reproduced from a clean clone.

## Governance

This constitution supersedes local conventions and feature plans. Amendments require a documented
rationale, an impact report, and semantic versioning: MAJOR for incompatible principle changes,
MINOR for new or materially expanded governance, and PATCH for clarifications. Every feature plan
MUST evaluate compliance before research and again after design. Exceptions MUST be time-bounded,
recorded in the plan's complexity section, and paired with an explicit removal or remediation task.

**Version**: 1.0.0 | **Ratified**: 2026-08-20 | **Last Amended**: 2026-08-20
