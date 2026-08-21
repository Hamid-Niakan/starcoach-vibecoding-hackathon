# Implementation Plan: Liara Assistant Quality

**Branch**: `codex/ai-gateway-integration` | **Date**: 2026-08-21 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/007-liara-assistant-quality/spec.md`

## Summary

Turn the existing secure, stateless OpenAI-compatible proxy and basic Liara chat shell into a
measurably grounded Persian-first documentation assistant. The implementation starts with a
versioned 300-point baseline, deterministically indexes the approved `public/llms` snapshot into a
revision-pinned hybrid Meilisearch index, adds bounded intent routing, retrieval, citation gating,
abstention, exact safe reuse, and content-free cost telemetry behind the existing public model alias,
then upgrades the shared chat consumer for structured sources, accessible technical content,
explicit preferences, workflows, and recovery. It finishes with fixed before/after evaluations,
production monitoring and runbooks, Liara staging evidence, rollback proof, and a hard release gate
for the separately specified supported Next.js upgrade.

## Technical Context

**Language/Version**: Python 3.12 for `ai-gw`; TypeScript 5.9 on Node.js 24 for workspace tooling,
shared packages, and the Next.js frontend

**Primary Dependencies**: FastAPI, Pydantic 2, HTTPX, Redis client, Prometheus client, Meilisearch
HTTP API, Next.js/React, Zod, React Markdown with GFM, Vitest/Testing Library, Playwright, axe-core

**Storage**: Redis for atomic anonymous enforcement and bounded revision-scoped caches;
Meilisearch for immutable candidate Liara indexes and atomic activation; `sessionStorage` for
anonymous per-tab conversation state; versioned JSON/JSONL evaluation and evidence artifacts.
No PostgreSQL, DuckDB, or server-owned conversation store.

**Testing**: pytest (unit, contract, security, Redis integration, failure injection, performance),
Vitest/Testing Library (schemas, client, state, rendering, accessibility), Playwright Chromium at
390px and 1440px, deterministic corpus/index checks, retrieval and answer evaluation runners,
Compose/image smoke checks, and manual Liara staging/rollback acceptance

**Target Platform**: Linux containers on Liara for the static-export Liara docs app and FastAPI
gateway, with private managed Redis and Meilisearch; evergreen Chromium for the browser client

**Project Type**: Monorepo web product with one independently deployable frontend, one authoritative
OpenAI-compatible gateway, shared browser packages, offline ingestion tooling, and operator evidence

**Performance Goals**: Deterministic tests show first visible answer content within 2 seconds for
95% of successful requests; every request terminates within its configured lifetime; retrieval
recall@8 is at least 95% for simple and 90% for complex cases; optimized repeated workload reduces
external processing cost by at least 25% with no more than a 2-point quality regression

**Constraints**: Persian-first RTL with explicit LTR islands; only approved revision-identified
Liara sources; stable public alias and OpenAI JSON/SSE shape; stateless completion requests; no raw
message bodies, provider identifiers, credentials, raw client addresses, or retrieval excerpts in
telemetry; bounded payload/history/retrieval/output/cache/deadlines; required enforcement and active
index fail closed; no ZarinPal connection; public deployment blocked while Next.js 14 remains

**Scale/Scope**: 1,143 current cleaned Markdown pages, an initial minimum 120-case reviewed
evaluation set (including at least 20 multi-turn cases), anonymous hackathon traffic across multiple
gateway replicas, one active corpus revision plus one rollback candidate, desktop and mobile chat

## Constitution Check

_GATE: Passed before Phase 0 research and re-checked after Phase 1 design._

| Constitution gate                     | Design evidence                                                                                                                                                                            | Result                          |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------- |
| Spec-driven delivery                  | Feature 007 has a validated specification; this plan supplies research, entities, contracts, and quickstart before tasks or implementation.                                                | PASS                            |
| Independent product boundaries        | Only Liara consumes the new metadata. ZarinPal remains disconnected. `ai-gw` consumes a versioned index contract and never imports Liara application modules.                              | PASS                            |
| Evidence and traceability             | Approved revisions, stable passage IDs, server-resolved citations, fixed evaluations, scorecard evidence, and deployment evidence are first-class entities.                                | PASS                            |
| Security, reliability, and cost       | Existing Redis admission remains fail closed; retrieval and output are bounded; provider identities stay protected; caches are HMAC-keyed and revision-scoped; metrics contain no content. | PASS                            |
| Reproducible team development         | Pinned Node/pnpm and Python/uv flows remain; ingestion is deterministic from the checked snapshot; generated indexes, reports, and secrets remain outside Git.                             | PASS                            |
| Persian-first accessible UX           | The design specifies RTL/LTR isolation, keyboard/focus/scroll behavior, terminal-only announcements, responsive checks, and zero serious/critical axe violations.                          | PASS                            |
| Authoritative backend/public contract | `/v1/models` and `/v1/chat/completions` remain stateless and OpenAI-compatible; additive `x_liara` metadata is versioned and contract-tested.                                              | PASS                            |
| Supported release                     | Feature 005 and `pnpm release:check` remain mandatory blockers before a public URL can be accepted.                                                                                        | PASS WITH EXTERNAL PREREQUISITE |

### Post-design re-check

Phase 1 introduces no second public backend, server-side history, application-source import, or
ZarinPal dependency. Meilisearch is a required private retrieval dependency, not a public API.
Additive response metadata is explicitly optional to generic OpenAI clients and mandatory only in
the Liara consumer profile. The only unresolved external evidence is actual Liara access, production
secrets, repository URL, and completion of the supported Next.js feature; the quickstart marks those
as release blockers rather than treating them as design clarifications.

## Baseline and Delivery Strategy

The first implementation phase MUST produce `docs/challenges/liara-assistant-scorecard.md` and a
machine-readable baseline using the same cases and measurement schema used after remediation.
Current evidence classifies answer grounding and agentic behavior as missing, UI as partial,
security/monitoring as a strong but incomplete foundation, Liara deployment as missing/blocked, and
cost optimization as partial. Code presence alone does not change a classification.

Implementation then proceeds through these gates:

1. Close prerequisite feature-006 live Redis, container, and browser evidence without duplicating it.
2. Build and validate an approved corpus revision and atomically activate its candidate index.
3. Add bounded intent, retrieval, grounding, citations, abstention, and usage accounting to `ai-gw`.
4. Extend contracts, browser state, rendering, preferences, workflow guidance, and feedback.
5. Calibrate retrieval, prompt, budget, and safe exact-cache policies on train cases; accept only on
   held-out quality, safety, latency, and cost gates.
6. Add protected metrics, alert rules, runbooks, Liara deployment descriptors, staging acceptance,
   rollback, and submission evidence.
7. Upgrade Next.js through feature 005, run all release gates, and only then accept a public URL.

## Project Structure

### Documentation (this feature)

```text
specs/007-liara-assistant-quality/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── browser-chat-state-v2.schema.json
│   ├── corpus-manifest.schema.json
│   ├── evaluation-case.schema.json
│   ├── evaluation-report.schema.json
│   └── openapi.yaml
└── tasks.md                         # Created later by $speckit-tasks
```

### Source Code (repository root)

```text
ai-gw/
├── src/ai_gateway/
│   ├── proxy/                       # Existing public OpenAI gateway and enforcement
│   └── grounding/                   # Index client, routing, prompt, citations, cache
├── tests/
│   ├── contract/
│   ├── evaluation/
│   ├── integration/
│   ├── security/
│   └── unit/grounding/
└── docs/                            # Metrics, alerts, failure and operator runbooks

apps/liara-docs/
├── public/llms/                     # Approved checked source input; not read at gateway runtime
└── src/                             # Existing docs UI and full-screen /chat integration

packages/
├── contracts/src/                  # x_liara, state-v2, feedback, and evidence schemas
├── api-client/src/                 # Additive metadata and safe feedback transport
└── chat-ui/src/                     # Sources, GFM/code UI, context, preferences, workflow, a11y

scripts/
├── liara-index/                     # Deterministic corpus parser/uploader/validator/activation
├── liara-eval/                      # Provider-neutral baseline, retrieval, answer, cost reports
└── check-release.mjs                # Existing release gate extended with feature evidence

evals/liara/
├── cases/                           # Reviewed versioned JSONL cases
├── rubrics/                         # Human and deterministic grading definitions
└── README.md

deploy/
├── liara/                           # Independent Liara app manifests/config inventories
└── monitoring/                      # Alert rules and dashboard definitions

docs/challenges/
├── liara-assistant-scorecard.md
└── liara-submission-evidence.md

.artifacts/                          # Gitignored indexes, eval runs, staging evidence
```

**Structure Decision**: Retain the existing monorepo and authoritative FastAPI gateway. Product
source is converted by a root offline tool into the versioned corpus contract; runtime gateway code
depends only on the private Meilisearch interface and manifest, never on `apps/liara-docs`. Shared
browser packages remain reusable and applications do not become package dependencies. ZarinPal is
covered only by boundary regression tests.

## Complexity Tracking

| Added complexity                        | Why needed                                                                                                                                                | Simpler alternative rejected because                                                                                                                             |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Required private Meilisearch dependency | Persian/English hybrid retrieval, immutable candidate indexes, stable passage records, atomic activation, and rollback are needed for measured grounding. | Live site search is not revision-controlled; lexical-only local search must still be benchmarked but is not accepted unless it passes the fixed retrieval gates. |
| Additive `x_liara` completion metadata  | The UI needs validated citations, revision, intent, workflow, and reuse state without parsing arbitrary model prose.                                      | Markdown links alone cannot safely carry the traceability and state contract; a new public endpoint would reduce OpenAI compatibility.                           |
| Paragraph-gated streaming               | Unsupported or unknown source markers must not be presented as grounded while preserving incremental output.                                              | Fully buffering answers harms conversational latency; forwarding raw model citation text permits invented URLs and unsupported markers.                          |
| Bounded exact answer reuse              | The fixed repeated workload requires a 25% external-cost reduction while preserving privacy and revision correctness.                                     | Semantic cross-user caching has false-equivalence and leakage risk; no answer cache cannot meet the declared repeated-workload target efficiently.               |
