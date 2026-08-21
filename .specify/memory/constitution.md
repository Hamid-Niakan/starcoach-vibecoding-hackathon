<!--
Sync Impact Report
- Version change: 1.0.0 -> 2.0.0
- Modified principles: Independent Product Boundaries; Security, Reliability, and Cost;
  Reproducible Team Development; Architecture and Data Constraints; Delivery Workflow and
  Quality Gates
- Added sections: none
- Removed constraints: NestJS shared backend; Drizzle-managed PostgreSQL and API-owned DuckDB as
  mandatory parts of the shared backend
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
Liara Docs, ZarinPal Dashboard, and the AI gateway MUST remain independently buildable, testable,
and deployable. A frontend MAY consume the gateway only through a versioned public contract after
a dedicated feature specification defines that integration. Connecting one product MUST NOT
implicitly connect another product. The gateway MUST NOT import application or product source
code. Applications MAY depend on versioned shared frontend packages; shared packages MUST NOT
depend on applications. Product data, authorization, configuration, and policy boundaries MUST
remain explicit.

### III. Evidence and Traceability
Every AI answer and analytical claim MUST be traceable to its inputs and calculation or retrieval
method. Liara answers MUST expose suitable documentation sources and avoid unsupported claims.
ZarinPal figures MUST be derived from the supplied attempt-level dataset and MUST make source
rows, filters, aggregation rules, and missing-value treatment inspectable. `adjusted_fee` MUST be
described only as an adjusted comparative metric, never as ZarinPal's actual fee.

### IV. Security, Reliability, and Cost
Secrets MUST enter through validated runtime configuration and MUST never be committed, logged,
or sent to browsers. Public OpenAI-compatible inputs MUST be validated and bounded by payload,
token, request-rate, quota, concurrency, and request-lifetime limits. Anonymous usage enforcement
MUST use atomic shared state; when that state is unavailable, the gateway MUST fail closed and
report itself not ready instead of allowing unmetered requests. Public model aliases, errors, and
logs MUST NOT reveal upstream model identifiers, provider URLs, credentials, or implementation
details. Logs MUST be structured and redact message bodies, credentials, and merchant data.
External calls MUST have timeouts, cancellation propagation, explicit failure states, and measured
token or query cost. The simplest model and data path that meets evaluated quality targets MUST be
preferred.

### V. Reproducible Team Development
A clean clone MUST be runnable from documented commands using the pinned Node.js/pnpm frontend
toolchain and the pinned Python/uv AI gateway toolchain, their committed lockfiles, example
environment files, and deterministic setup steps. Root documentation and tasks MUST cover build,
lint, formatting, type checking, and tests for both toolchains and MUST allow gateway and frontend
checks to run independently. Generated data, secrets, virtual environments, local databases,
caches, and raw merchant datasets MUST remain outside version control. Upstream vendored sources
MUST record provenance and update procedure.

### VI. Persian-First Accessible UX
Product chrome MUST be understandable to Persian-speaking non-technical users and MUST support
responsive mobile and desktop use. Directionality MUST be explicit: Persian prose uses RTL while
code, URLs, identifiers, and suitable technical passages use isolated LTR presentation. Keyboard
operation, visible focus, semantic structure, readable contrast, loading states, empty states, and
recoverable errors are acceptance requirements rather than optional polish.

## Architecture and Data Constraints

- The workspace uses pnpm and Turborepo with applications in `apps/` and reusable packages in
  `packages/`; internal package names use the `@hackathon/*` scope.
- Frontends use Next.js and React. `ai-gw/` MUST be the authoritative shared backend and MUST
  preserve the imported FastAPI gateway architecture. It MUST expose a versioned OpenAI-compatible
  interface for model discovery and chat completions, including streaming and compatible error
  behavior. After gateway integration, the legacy NestJS backend MUST NOT remain active in build,
  start, Compose, or deployment documentation.
- Gateway completion requests MUST be stateless: clients provide the messages required for each
  completion. The gateway MUST NOT own conversation history unless a later specification changes
  this boundary. Anonymous enforcement MUST use Redis-backed atomic state and MUST preserve
  security and observable behavior across supported Redis implementations.
- The gateway MUST call only explicitly configured upstream services. Provider identities and
  credentials MUST remain server-side; clients MUST address models through stable public aliases.
- ZarinPal analytical storage and processing, including any future PostgreSQL or DuckDB use, MUST
  be specified independently and MUST NOT be forced into the AI gateway architecture.
- The official ZarinPal dataset is read-only input. Raw input and derived DuckDB files MUST be
  gitignored; tracked metadata MUST include source identity and integrity information.
- Gateway interface changes require versioned OpenAI-compatible schemas and contract tests in the
  gateway and every affected consumer. Consumers MUST NOT import gateway-internal source code.
- A framework version without security support MUST NOT be publicly deployed. Temporary legacy
  versions MAY be used only behind an explicit release-blocking upgrade task.

## Delivery Workflow and Quality Gates

1. Select exactly one active Spec Kit feature and point `.specify/feature.json` to it.
2. Complete specification quality checks and resolve all material clarifications.
3. Complete research, data model, public contracts, quickstart, plan, and tasks before implementation.
4. Implement tasks in dependency order and mark them complete only after their acceptance checks pass.
5. Run affected workspace checks continuously and all terminating root checks before feature closure.
6. Validate production images and Compose configuration for deployment-related changes. Gateway
   changes MUST also validate OpenAI compatibility, streaming termination, cancellation, security
   parity, rate and quota enforcement, redacted errors, and dependency-aware readiness. Affected
   product integrations MUST be browser-tested through their frontend.
7. Document deferred risks and prevent release when a required security, data, or traceability gate fails.

Reviewers MUST reject undocumented scope expansion, untraceable metrics, cross-product data access,
unbounded AI/data operations, leaked secrets, or changes that cannot be reproduced from a clean clone.

## Governance

This constitution supersedes local conventions and feature plans. Amendments require a documented
rationale, an impact report, and semantic versioning: MAJOR for incompatible principle changes,
MINOR for new or materially expanded governance, and PATCH for clarifications. Every feature plan
MUST evaluate compliance before research and again after design. Exceptions MUST be time-bounded,
recorded in the plan's complexity section, and paired with an explicit removal or remediation task.

**Version**: 2.0.0 | **Ratified**: 2026-08-20 | **Last Amended**: 2026-08-21
