---
description: "Dependency-ordered implementation tasks for the Liara Assistant Quality feature"
---

# Tasks: Liara Assistant Quality

**Input**: Design documents from `/specs/007-liara-assistant-quality/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md`

**Tests**: Tests are required because the specification mandates fixed before/after evaluations,
contract parity, browser acceptance, accessibility, failure injection, security, deployment, and
cost-quality gates. Within each story, write the listed tests first and observe the intended failures
before implementing behavior.

**Organization**: Tasks are grouped by user story so each scored capability can be implemented and
validated independently with deterministic fixtures.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel with other marked tasks after its phase prerequisites are satisfied
- **[Story]**: Maps the task to a user story in `spec.md`
- Every task names the files it creates or changes

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Establish reproducible directories, dependencies, commands, and baseline evidence
without changing production behavior.

- [x] T001 Add generated Liara index, evaluation, staging, and report paths to `.gitignore` and document the `.artifacts/liara/` layout in `evals/liara/README.md`
- [x] T002 Add pinned indexing, Markdown parsing, JSON Schema, and evaluation CLI dependencies plus scripts to `package.json` and `pnpm-lock.yaml`
- [x] T003 [P] Add explicit gateway development/evaluation dependencies and pytest markers to `ai-gw/pyproject.toml` and refresh `ai-gw/uv.lock`
- [x] T004 [P] Create the reviewed dataset/rubric directory skeleton and ownership rules in `evals/liara/cases/README.md` and `evals/liara/rubrics/human-rubric.md`
- [x] T005 [P] Add secret ownership, Liara retrieval, metrics, cache, budget, and cost-coefficient names without real values to `.env.example` and `ai-gw/.env.example`
- [x] T006 Create the initial 300-point implemented/partial/missing/blocked evidence matrix with validation commands in `docs/challenges/liara-assistant-scorecard.md`
- [x] T007 [P] Add feature-specific output directories and command ownership to `CONTRIBUTING.md` and the root command table in `README.md`

**Checkpoint**: The clean-clone toolchain understands all planned commands and generated artifacts
remain outside version control.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Implement shared contracts, configuration, evaluation I/O, and prerequisite evidence
needed by every story.

**⚠️ CRITICAL**: Complete this phase before story implementation.

- [x] T008 [P] Add fail-first parity tests for the OpenAPI `x_liara`, corpus manifest, evaluation case/report, and browser-state-v2 contracts in `packages/contracts/src/liara-assistant-contracts.test.ts`
- [x] T009 Implement strict Zod schemas, inferred types, cross-field invariants, and public exports for all feature contracts in `packages/contracts/src/liara-assistant.ts` and `packages/contracts/src/index.ts`
- [x] T010 [P] Add fail-first configuration tests covering Meilisearch, active revision, policy versions, cache HMAC, metrics token, route budgets, and price coefficients in `ai-gw/tests/unit/proxy/test_liara_grounding_config.py`
- [x] T011 Extend immutable fail-closed configuration parsing and validation without exposing protected values in `ai-gw/src/ai_gateway/proxy/proxy_config.py` and `ai-gw/tests/support.py`
- [x] T012 [P] Add fail-first domain invariant tests for approved revisions, passages, citations, routing decisions, budgets, usage records, and cache eligibility in `ai-gw/tests/unit/grounding/test_models.py`
- [x] T013 Implement immutable Pydantic grounding entities and closed enums in `ai-gw/src/ai_gateway/grounding/models.py` and export them from `ai-gw/src/ai_gateway/grounding/__init__.py`
- [x] T014 [P] Add fail-first tests for JSONL loading, schema validation, artifact checksums, secret scanning, and baseline/final report state transitions in `scripts/liara-eval/evaluation-io.test.ts`
- [x] T015 Implement provider-neutral case/report I/O, schema validation, deterministic checksums, and redacted artifact writing in `scripts/liara-eval/evaluation-io.ts` and `scripts/liara-eval/cli.ts`
- [x] T016 Wire `liara:audit`, `liara:eval:validate`, retrieval, answer, security, cost, and evidence commands through `package.json` and `scripts/liara-eval/cli.ts`
- [x] T017 Generate and validate the immutable pre-remediation baseline report in `.artifacts/liara/baseline/report.json` and record its checksum/evidence links in `docs/challenges/liara-assistant-scorecard.md`
- [ ] T018 Close the feature-006 live Redis, multi-instance, container, and browser prerequisite checks and record pass/block evidence in `specs/006-integrate-ai-gateway/validation.md`
- [x] T019 [P] Extend product-boundary regression tests to reject Liara retrieval/configuration imports or gateway calls from ZarinPal in `tests/ops/product-boundaries.test.ts` and `tests/e2e/zarinpal-boundary.spec.ts`

**Checkpoint**: Contracts and evaluation artifacts validate, configuration fails closed, the baseline
is frozen, and prior integration debt is explicitly passed or blocked.

---

## Phase 3: User Story 1 - Receive Grounded Documentation Answers (Priority: P1) 🎯 MVP

**Goal**: Answer simple and complex Liara questions from an exact official revision with adjacent,
valid citations and safe clarification/abstention when evidence is insufficient.

**Independent Test**: Run the fixed direct, complex, troubleshooting, comparison, and unanswerable
evaluation cases against the gateway and inspect correctness, completeness, citation destination and
entailment, uncertainty behavior, and active revision without using the enhanced chat UI.

### Tests for User Story 1

- [x] T020 [P] [US1] Add fail-first deterministic corpus parsing, canonical URL/anchor, stable-ID, structural chunk, checksum, and repeat-build tests in `scripts/liara-index/corpus.test.ts`
- [x] T021 [P] [US1] Add fail-first candidate publish, count/checksum validation, atomic activation, mismatch, and rollback tests with a fake Meilisearch server in `scripts/liara-index/meilisearch.test.ts`
- [x] T022 [P] [US1] Add fail-first Persian/English/Finglish normalization, hybrid ranking, filtering, diversity, threshold, conflict, and bounded-selection tests in `ai-gw/tests/unit/grounding/test_retrieval.py`
- [x] T023 [P] [US1] Add fail-first source-marker splitting, paragraph gating, allowlisted URL resolution, unknown marker, missing citation, and safe-abstention tests in `ai-gw/tests/unit/grounding/test_citations.py`
- [x] T024 [P] [US1] Add fail-first grounded non-stream and terminal-metadata SSE contract tests, including exactly one metadata chunk and `[DONE]`, in `ai-gw/tests/contract/test_grounded_chat_contract.py`
- [x] T025 [P] [US1] Add fail-first prompt-injection, caller-role demotion, fake-source, arbitrary URL, conflict, prompt extraction, and no-tool/no-action tests in `ai-gw/tests/security/test_grounding_boundary.py`
- [x] T026 [P] [US1] Add fail-first index loss, timeout, malformed search response, cancellation, partial paragraph, and conservative reconciliation tests in `ai-gw/tests/integration/test_grounding_failures.py`

### Implementation for User Story 1

- [x] T027 [P] [US1] Implement deterministic Markdown discovery, frontmatter/original-link extraction, Unicode-safe normalization, and route inventory loading in `scripts/liara-index/corpus.ts`
- [x] T028 [US1] Implement heading/list/table/code-aware chunking with stable passage IDs, overlap, token ceilings, and duplicate suppression in `scripts/liara-index/chunker.ts`
- [x] T029 [US1] Generate schema-valid corpus manifests, sorted aggregate checksums, counts, and public-safe revision digests in `scripts/liara-index/manifest.ts`
- [x] T030 [P] [US1] Implement candidate index creation, batch upload, settings/embedder pinning, integrity smoke checks, atomic swap, and compatible rollback in `scripts/liara-index/meilisearch.ts`
- [x] T031 [US1] Implement `build`, `validate`, `publish --candidate`, `activate`, and `rollback` commands in `scripts/liara-index/cli.ts` and expose them through `package.json`
- [x] T032 [P] [US1] Implement the bounded async Meilisearch health/manifest/search client with deadlines, cancellation, and sanitized errors in `ai-gw/src/ai_gateway/grounding/index_client.py`
- [x] T033 [US1] Implement raw/normalized multilingual retrieval, service taxonomy filters, lexical/dense fusion inputs, deduplication, diversity, confidence bands, and direct/complex caps in `ai-gw/src/ai_gateway/grounding/retrieval.py`
- [x] T034 [P] [US1] Implement immutable prompt envelopes that demote all caller roles and delimit retrieved passages as untrusted evidence in `ai-gw/src/ai_gateway/grounding/prompt.py`
- [x] T035 [US1] Implement server-owned source-ID citation resolution, bounded paragraph buffering, adjacent Markdown links, and invalid-output abstention in `ai-gw/src/ai_gateway/grounding/citations.py`
- [x] T036 [US1] Implement the direct/complex/clarify/abstain/out-of-scope/elevated-risk request pipeline and safe uncertainty behavior in `ai-gw/src/ai_gateway/grounding/orchestrator.py`
- [x] T037 [US1] Integrate retrieval, grounding, cancellation, usage reconciliation, terminal `x_liara`, and unchanged OpenAI errors/SSE termination into `ai-gw/src/ai_gateway/proxy/common_request_processing.py`
- [x] T038 [US1] Require compatible Redis enforcement and active corpus manifest for readiness while retaining request-time upstream health in `ai-gw/src/ai_gateway/proxy/endpoints/health.py` and `ai-gw/src/ai_gateway/proxy/proxy_server.py`
- [x] T039 [US1] Update live FastAPI schema generation and producer/consumer parity for grounded metadata in `ai-gw/src/ai_gateway/proxy/endpoints/docs.py` and `ai-gw/tests/contract/test_consumer_profile.py`
- [ ] T040 [P] [US1] Build at least 120 reviewed versioned cases with the required category/language/multi-turn distribution in `evals/liara/cases/v1.jsonl` and document source-review ownership in `evals/liara/cases/README.md`
- [x] T041 [US1] Implement corpus integrity, recall@k, MRR/nDCG, irrelevant-context, citation allowlist/adjacency, required/forbidden claim, and human-rubric reporting in `scripts/liara-eval/retrieval-runner.ts` and `scripts/liara-eval/answer-runner.ts`
- [ ] T042 [US1] Run the independent US1 held-out evaluation, preserve the report in `.artifacts/liara/us1/report.json`, and update answer-quality rows/evidence in `docs/challenges/liara-assistant-scorecard.md`

**Checkpoint**: The OpenAI-compatible API independently meets the grounded-answer, citation,
abstention, and retrieval gates; generic clients can ignore `x_liara`.

---

## Phase 4: User Story 2 - Continue an Accessible Conversation (Priority: P2)

**Goal**: Deliver a discoverable Persian-first desktop/mobile chat that safely renders grounded
technical answers and remains predictable through streaming, continuation, recovery, and reload.

**Independent Test**: Use mocked valid grounded chunks to complete the same keyboard-only multi-turn
journey at 390px and 1440px, including sources, code/table/URL rendering, stop, retry, reload, offline,
and failure recovery, without requiring live retrieval quality.

### Tests for User Story 2

- [x] T043 [P] [US2] Add fail-first API-client tests for terminal `x_liara`, duplicate/missing metadata, invalid citations, request IDs, cancellation, and generic extension tolerance in `packages/api-client/src/liara-metadata.test.ts`
- [x] T044 [P] [US2] Add fail-first state-v1 migration, state-v2 invariants, restore-streaming-to-stopped, retry pairing, feedback, and bounded persistence tests in `packages/chat-ui/src/session-storage-v2.test.ts`
- [x] T045 [P] [US2] Add fail-first GFM, safe-link, citation, code-copy, table overflow, RTL/LTR, onboarding, new-chat, focus, scroll, reduced-motion, and axe component tests in `packages/chat-ui/src/ChatPanel.quality.test.tsx`
- [x] T046 [P] [US2] Add fail-first desktop/mobile keyboard journeys for citations, mixed technical content, stop/retry/reload/noopener tab, offline, timeouts, incomplete streams, and no overflow in `tests/e2e/liara-quality-ux.spec.ts`

### Implementation for User Story 2

- [x] T047 [P] [US2] Implement strict `LiaraAssistantMetadataV1` parsing, citation-origin validation, and terminal-chunk extraction in `packages/api-client/src/client.ts` and `packages/api-client/src/sse.ts`
- [x] T048 [P] [US2] Implement browser-state-v2 types, v1 migration, cross-field validation, stable-only persistence, and safe invalid-state reset in `packages/chat-ui/src/session-storage.ts`
- [x] T049 [US2] Extend conversation actions/reducer for completed metadata, source state, local enum feedback, stopped/failed semantics, and duplicate-free retry in `packages/chat-ui/src/conversation-reducer.ts`
- [x] T050 [US2] Consume terminal metadata, keep request IDs, handle malformed/missing metadata, and persist only stable transitions in `packages/chat-ui/src/use-liara-chat.ts`
- [x] T051 [P] [US2] Implement safe GFM rendering, protocol allowlisting, explicit bidi wrappers, language-labelled code blocks, accessible copy feedback, and scrollable tables in `packages/chat-ui/src/TechnicalMarkdown.tsx`
- [x] T052 [P] [US2] Implement adjacent citation markers, validated source cards, revision disclosure, invalid-source fallback, and noopener navigation in `packages/chat-ui/src/CitationList.tsx`
- [x] T053 [P] [US2] Implement Persian onboarding, non-submitting example prompts, system-state copy, and confirmed new-conversation controls in `packages/chat-ui/src/ChatEmptyState.tsx` and `packages/chat-ui/src/NewConversationButton.tsx`
- [x] T054 [US2] Implement near-bottom stream following, non-stealing “new response” jump, initiating-control focus recovery, terminal-only announcements, and reduced motion in `packages/chat-ui/src/ChatPanel.tsx`
- [x] T055 [US2] Implement responsive 390px/1440px layouts, 44px controls, safe-area composer, code/table overflow containment, focus visibility, and RTL/LTR islands in `packages/chat-ui/src/styles.css`
- [x] T056 [P] [US2] Add thumbs-up/down selected state and enum-only local reason controls without free text in `packages/chat-ui/src/FeedbackControls.tsx`
- [x] T057 [US2] Integrate the enhanced shared panel into the floating launcher and full-screen route without changing ZarinPal in `apps/liara-docs/src/components/ChatLauncher.tsx` and `apps/liara-docs/src/pages/chat.tsx`
- [ ] T058 [US2] Run both viewport projects plus manual keyboard/assistive checks, save artifacts under `.artifacts/liara/us2/`, and update UI/UX scorecard evidence in `docs/challenges/liara-assistant-scorecard.md`

**Checkpoint**: The UI story passes independently against deterministic grounded fixtures on desktop
and mobile, including all accessibility and recovery states.

---

## Phase 5: User Story 3 - Get Intent-Aware Guidance (Priority: P3)

**Goal**: Ask clarification only when material, adapt to explicit preferences/context, maintain
bounded workflow progress, and refuse unsupported account/action claims.

**Independent Test**: Run ambiguous, clear, novice/experienced, topic-shift, multi-step, destructive,
and live-state cases against a deterministic retrieval/provider fixture and inspect only intent,
context, workflow, and next-action behavior.

### Tests for User Story 3

- [x] T059 [P] [US3] Add fail-first route-policy tests for clear, ambiguous, Finglish, topic-shift, out-of-scope, elevated-risk, and no-unnecessary-planner cases in `ai-gw/tests/unit/grounding/test_intent_router.py`
- [x] T060 [P] [US3] Add fail-first bounded context tests for latest-turn retention, relevance, failed/streaming exclusion, stopped output, explicit preferences, topic reset, and no silent summarization in `packages/chat-ui/src/context-selector.test.ts`
- [x] T061 [P] [US3] Add fail-first workflow state-transition, user-confirmation, reset, retry, and maximum-step tests in `packages/chat-ui/src/workflow-reducer.test.ts`
- [x] T062 [P] [US3] Add fail-first browser/evaluation journeys for clarification accuracy, direct answers, novice/expert adaptation, workflow progress, and account/action boundaries in `tests/e2e/liara-agentic.spec.ts` and `ai-gw/tests/evaluation/test_agentic_cases.py`

### Implementation for User Story 3

- [x] T063 [P] [US3] Implement deterministic route features, missing-field decisions, topic-change handling, and reason codes in `ai-gw/src/ai_gateway/grounding/intent.py`
- [x] T064 [US3] Implement the optional one-call bounded planner for ambiguous, Finglish, or weak complex retrieval and include its usage in admission/reconciliation in `ai-gw/src/ai_gateway/grounding/planner.py`
- [x] T065 [US3] Integrate route decisions, concise clarification, complex workflow prompts, safe boundaries, and no-action claims into `ai-gw/src/ai_gateway/grounding/orchestrator.py`
- [x] T066 [P] [US3] Implement explicit language/experience/service preference state and controls in `packages/chat-ui/src/ConversationPreferences.tsx`
- [x] T067 [P] [US3] Implement bounded relevant-history selection and advisory developer-context serialization in `packages/chat-ui/src/context-selector.ts`
- [x] T068 [P] [US3] Implement workflow hydration, forward-only/user-confirmed transitions, topic reset, and new-chat reset in `packages/chat-ui/src/workflow-reducer.ts`
- [x] T069 [US3] Render workflow progress, verification points, blocked states, and prompt/URL next-step actions in `packages/chat-ui/src/WorkflowCard.tsx` and `packages/chat-ui/src/NextStepActions.tsx`
- [ ] T070 [US3] Add and review required ambiguous, clear-no-clarification, preference, topic-shift, workflow, destructive, and live-state cases in `evals/liara/cases/v1.jsonl`
- [ ] T071 [US3] Run the independent agentic/context evaluation, store `.artifacts/liara/us3/report.json`, and update agentic scorecard evidence in `docs/challenges/liara-assistant-scorecard.md`

**Checkpoint**: Intent and workflow behavior passes its fixed cases without requiring the final visual
or production-deployment story.

---

## Phase 6: User Story 4 - Use a Safe and Reliable Assistant (Priority: P4)

**Goal**: Preserve bounded multi-instance admission while adding safe RAG failures, protected
content-free observability, actionable alerts, and deterministic cleanup.

**Independent Test**: Run security, dependency-failure, multi-instance, cancellation, load, metrics
authentication, log-canary, and alert-rule tests against the public API while inspecting no content.

### Tests for User Story 4

- [x] T072 [P] [US4] Add fail-first production/local metrics authentication, no-CORS, no-store, constant-time denial, and OpenAPI security tests in `ai-gw/tests/security/test_metrics_access.py`
- [x] T073 [P] [US4] Add fail-first bounded-label metrics and content-free usage-event tests for routes, retrieval, cache, TTFT, tokens, cost, budgets, and failures in `ai-gw/tests/unit/observability/test_grounding_metrics.py`
- [x] T074 [P] [US4] Add fail-first Redis/index/cache/upstream loss, readiness, fail-closed admission, cancellation, deadline, and exactly-once cleanup tests in `ai-gw/tests/integration/test_grounding_resilience.py`
- [x] T075 [P] [US4] Add fail-first multi-replica RPM/TPM/quota/concurrency/budget boundary and recovery tests in `ai-gw/tests/performance/test_grounding_multi_instance.py`
- [x] T076 [P] [US4] Add seeded secret/provider/message/passage/IP canary scans across errors, logs, metrics, browser bundles, and artifacts in `ai-gw/tests/security/test_grounding_redaction.py` and `tests/ops/secret-artifact-scan.test.ts`
- [x] T077 [P] [US4] Add alert syntax, threshold, owner, and runbook-link tests in `tests/ops/liara-alerts.test.ts`

### Implementation for User Story 4

- [x] T078 [US4] Protect `/metrics` with a dedicated validated bearer token, explicit local exception, no CORS, no-store, and sanitized denial in `ai-gw/src/ai_gateway/proxy/endpoints/metrics.py`
- [x] T079 [P] [US4] Extend content-free Prometheus counters/histograms without unbounded labels in `ai-gw/src/ai_gateway/proxy/observability/prometheus.py`
- [x] T080 [P] [US4] Extend allowlisted structured request outcomes with route, revision digest, retrieval/cache counts, token classes, TTFT, cost micro-units, and budget result in `ai-gw/src/ai_gateway/proxy/observability/events.py`
- [x] T081 [US4] Emit and reconcile one sanitized usage record per terminal request without content or protected identities in `ai-gw/src/ai_gateway/proxy/middleware/in_flight_requests_middleware.py` and `ai-gw/src/ai_gateway/grounding/usage.py`
- [x] T082 [US4] Make index compatibility a fail-closed readiness dependency while keeping cache failure degradable and upstream failure request-scoped in `ai-gw/src/ai_gateway/proxy/endpoints/health.py`
- [x] T083 [US4] Propagate cancellation and absolute deadlines through retrieval, planning, generation, paragraph gating, cache, and reconciliation in `ai-gw/src/ai_gateway/grounding/orchestrator.py`
- [x] T084 [P] [US4] Add readiness, log-drop, 5xx, timeout, TTFT, completion-latency, limit/quota, retrieval/cache anomaly, and daily-cost alert rules in `deploy/monitoring/liara-assistant-alerts.yaml`
- [x] T085 [P] [US4] Write owner-linked diagnosis and recovery procedures for every alert and dependency failure in `ai-gw/docs/liara-assistant-operations.md`
- [x] T086 [US4] Add Redis, Meilisearch, deterministic index activation, mock upstream, and health-based gateway ordering to `compose.yaml` while preserving the ZarinPal boundary
- [ ] T087 [US4] Run the full security/resilience/load suite, store `.artifacts/liara/us4/report.json`, and update security/monitoring scorecard evidence in `docs/challenges/liara-assistant-scorecard.md`

**Checkpoint**: All required limits and dependencies have deterministic safe behavior, protected
metrics, correlatable failures, and actionable operator evidence.

---

## Phase 7: User Story 5 - Deploy and Operate on Liara (Priority: P5)

**Goal**: Deploy independently from a clean clone to Liara, validate production behavior, roll back,
and preserve submission evidence without secrets.

**Independent Test**: A teammate follows only the runbook to stage the gateway and docs apps, runs
the critical public suite at both viewports, simulates or performs rollback within 30 minutes, and
validates the evidence bundle.

### Tests for User Story 5

- [x] T088 [P] [US5] Add fail-first Liara manifest/config-name, independent-image, private-dependency, health-check, and no-Compose-as-deployment tests in `tests/ops/liara-deployment.test.ts`
- [x] T089 [P] [US5] Add fail-first deployment-evidence schema, checksum, no-secret, revision compatibility, and rollback-record tests in `scripts/liara-eval/deployment-evidence.test.ts`
- [x] T090 [P] [US5] Extend release-gate tests to reject unsupported Next.js, missing critical reports, mismatched corpus revision, and absent rollback evidence in `scripts/check-release.test.mjs`

### Implementation for User Story 5

- [x] T091 [P] [US5] Create the root-context production gateway image with approved-index startup validation and readiness healthcheck in `deploy/liara/Dockerfile.gateway`
- [ ] T092 [P] [US5] Create the supported-version static Liara docs image with build-time-only public gateway origin and runtime healthcheck in `deploy/liara/Dockerfile.docs`
- [x] T093 [US5] Add independent Liara gateway/docs app manifests, private Redis/Meilisearch inventory, scaling assumptions, and configuration-name ownership in `deploy/liara/gateway.json`, `deploy/liara/docs.json`, and `deploy/liara/configuration.md`
- [x] T094 [US5] Implement idempotent enforcement bootstrap plus active-index compatibility validation before serving in `ai-gw/src/ai_gateway/startup.py` and `ai-gw/src/ai_gateway/__main__.py`
- [x] T095 [P] [US5] Implement staging smoke, grounded chat, citation, limit, sanitized-failure, health, and viewport acceptance commands in `scripts/liara-eval/staging-acceptance.ts`
- [x] T096 [P] [US5] Implement schema-valid configuration-name, revision, image-digest, acceptance-checksum, operator, and rollback evidence assembly in `scripts/liara-eval/deployment-evidence.ts`
- [x] T097 [US5] Write the clean-clone Liara provisioning, build, deploy, DNS/CORS, health, scaling, troubleshooting, promotion, and rollback runbook in `deploy/liara/README.md`
- [ ] T098 [US5] Complete feature 005's supported Next.js upgrade and record its passing release-gate evidence in `specs/005-nextjs-supported-upgrade/validation.md`
- [ ] T099 [US5] Execute staging deployment and rollback, save `.artifacts/liara/staging/evidence.json`, and update deployment/submission evidence in `docs/challenges/liara-submission-evidence.md` and `docs/challenges/liara-assistant-scorecard.md`

**Checkpoint**: Deployment receives credit only when real staging/public evidence passes; unavailable
Liara access or the framework upgrade remains an explicit blocker.

---

## Phase 8: User Story 6 - Deliver Quality Within a Cost Budget (Priority: P6)

**Goal**: Bound and explain per-route cost, safely reuse eligible exact work, identify expensive
classes, and prove at least 25% repeated-workload savings without material quality loss.

**Independent Test**: Run the fixed held-out quality set and repeated-question workload with reuse
off/on, then compare token, retrieval, latency, cost, hit-rate, budget, and quality reports without
using conversation content in operational records.

### Tests for User Story 6

- [x] T100 [P] [US6] Add fail-first route-budget reservation, hidden-call accounting, shortening/rejection, integer-cost, and aggregate-threshold tests in `ai-gw/tests/unit/grounding/test_budgets.py`
- [x] T101 [P] [US6] Add fail-first HMAC-key, exact-retrieval, eligible-answer, PII/secret/identifier rejection, revision invalidation, TTL/capacity, and cache-failure tests in `ai-gw/tests/unit/grounding/test_cache.py`
- [x] T102 [P] [US6] Add fail-first repeated-workload comparison and ≤2-point quality-regression gate tests in `scripts/liara-eval/cost-runner.test.ts`
- [x] T103 [P] [US6] Add fail-first protected-model candidate comparison and stable-public-alias leakage tests in `ai-gw/tests/security/test_model_cost_policy.py`

### Implementation for User Story 6

- [x] T104 [P] [US6] Implement validated direct/complex/clarify budget profiles, worst-case hidden-call reservation, preflight shortening/rejection, and exactly-once reconciliation in `ai-gw/src/ai_gateway/grounding/budgets.py`
- [x] T105 [P] [US6] Implement integer micro-unit cost estimation from protected coefficients and aggregate budget decisions in `ai-gw/src/ai_gateway/grounding/cost.py`
- [x] T106 [US6] Integrate route budgets and total planning/generation token accounting into `ai-gw/src/ai_gateway/grounding/orchestrator.py` and `ai-gw/src/ai_gateway/proxy/enforcement/redis_store.py`
- [x] T107 [P] [US6] Implement revision/policy-scoped exact retrieval caching with HMAC keys, bounded TTL/capacity, and cache-error fallback in `ai-gw/src/ai_gateway/grounding/cache.py`
- [x] T108 [US6] Implement reviewed exact-answer eligibility, secret/identifier rejection, citation-valid storage, one-hour initial TTL, and immediate revision invalidation in `ai-gw/src/ai_gateway/grounding/cache.py`
- [x] T109 [US6] Implement provider/model candidate comparison, repeated-workload execution, quality/cost correlation, and regression gates in `scripts/liara-eval/cost-runner.ts`
- [x] T110 [P] [US6] Document protected candidate selection, deployed route budgets, price-coefficient ownership, aggregate thresholds, and optimization acceptance in `ai-gw/docs/liara-assistant-cost-policy.md`
- [ ] T111 [US6] Benchmark lexical/hybrid embedder candidates and generation candidates, select the least-cost passing policy, and record only public-safe digests/results in `.artifacts/liara/us6/model-selection.json`
- [ ] T112 [US6] Run uncached/cached held-out and repeated workloads, preserve `.artifacts/liara/us6/report.json`, and update cost scorecard evidence in `docs/challenges/liara-assistant-scorecard.md`

**Checkpoint**: The declared quality/cost comparison passes, and every accepted request stays within
its budget or is safely shortened/rejected.

---

## Phase 9: Polish & Cross-Cutting Completion

**Purpose**: Reconcile all stories, complete traceability, and run terminating release checks.

- [x] T113 [P] Update architecture, public contract, ingestion, evaluation, monitoring, and deployment navigation in `docs/architecture/overview.md`, `README.md`, and `CONTRIBUTING.md`
- [x] T114 [P] Add every new tracked source/config/document path to root formatting, linting, type-checking, build, test, and clean-clone commands in `package.json` and `turbo.json`
- [x] T115 Run two clean deterministic corpus builds and compare checksums, then record the result in `.artifacts/liara/final/corpus-reproducibility.json`
- [ ] T116 Run independent gateway/docs images and the complete Compose stack with health checks, then record image digests and results in `.artifacts/liara/final/container-validation.json`
- [ ] T117 Run all Node, gateway, Redis/Meilisearch integration, security, performance, Playwright, axe, evaluation, and ops checks required by `specs/007-liara-assistant-quality/quickstart.md`
- [x] T118 Run final canary/redaction scans and verify tracked files, browser assets, errors, logs, metrics, traces, and evidence contain no prohibited data in `.artifacts/liara/final/redaction-report.json`
- [x] T119 Reconcile all 41 functional requirements and 18 success criteria to before/after evidence, leaving zero silent partial/missing rows, in `docs/challenges/liara-assistant-scorecard.md`
- [x] T120 Run `pnpm build`, `pnpm lint`, `pnpm type-check`, `pnpm test`, `pnpm format:check`, `pnpm release:check`, and the full quickstart; record terminal completion or explicit external blockers in `specs/007-liara-assistant-quality/validation.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: Starts immediately.
- **Foundational (Phase 2)**: Depends on Setup and blocks story implementation.
- **US1 (Phase 3)**: Depends on Foundational; produces the grounded API MVP.
- **US2 (Phase 4)**: Depends on Foundational contract types and can use deterministic US1 fixtures;
  live integration validation follows US1.
- **US3 (Phase 5)**: Depends on Foundational and can use mocked retrieval/provider responses; final
  integration validation follows US1 and US2.
- **US4 (Phase 6)**: Depends on Foundational; RAG-specific resilience validation follows US1/US3.
- **US5 (Phase 7)**: Depends on accepted US1–US4 and US6 behavior, closed feature-006 evidence, and
  feature 005's supported Next.js upgrade.
- **US6 (Phase 8)**: Budget/cache implementation may begin after Foundational; its quality/cost
  acceptance depends on US1 and the fixed held-out dataset.
- **Polish (Phase 9)**: Depends on every in-scope story; external deployment blockers remain explicit.

### User Story Dependency Graph

```text
Setup -> Foundation -> US1 (grounded API MVP) ----+----> US2 (accessible UI) ----+
                                                  |                             |
                                                  +----> US3 (agentic guidance) -+--> US5 (Liara deploy)
                                                  |                             |
                                                  +----> US4 (safe operations) --+
                                                  |                             |
                                                  +----> US6 (cost control) -----+

Feature 006 live evidence -------------------------------> US5
Feature 005 supported Next.js ---------------------------> US5
US1..US6 ------------------------------------------------> Polish/final evidence
```

### Within Each User Story

1. Write the story's tests and confirm the intended failures.
2. Implement entities/configuration before services.
3. Implement services before public/UI integration.
4. Run the independent story test and preserve its report.
5. Update the scorecard only from passing evidence.

## Parallel Opportunities

- Setup: T003, T004, T005, and T007 can run concurrently after T002's dependency choices are known.
- Foundation: T008, T010, T012, T014, and T019 touch different test/tooling areas.
- US1 tests T020–T026 can be authored concurrently; implementation can split into ingestion
  T027–T031, gateway retrieval T032–T036, contracts T039, and dataset T040.
- US2 tests T043–T046 can run concurrently; renderer T051, sources T052, onboarding T053, and
  feedback T056 are separate components.
- US3 tests T059–T062 can run concurrently; backend routing T063–T065 and browser state/UI T066–T069
  can proceed as two streams.
- US4 tests T072–T077 and implementation work on metrics T078–T081, alerts T084–T085, and Compose
  T086 have distinct files.
- US5 image tasks T091–T092, staging acceptance T095, and evidence tooling T096 can run concurrently
  after deployment contracts are frozen.
- US6 tests T100–T103 and implementation pairs T104/T105/T107/T110 can run concurrently before
  orchestrator integration.

## Parallel Examples by User Story

### User Story 1

```text
T020 corpus determinism tests | T022 retrieval tests | T023 citation tests | T024 API contract tests
T027 corpus parser/chunker stream | T032 gateway index client/retrieval stream | T040 dataset review stream
```

### User Story 2

```text
T043 API-client tests | T044 state tests | T045 component/a11y tests | T046 browser tests
T051 technical renderer | T052 citation components | T053 onboarding | T056 feedback
```

### User Story 3

```text
T059 backend intent tests | T060 context tests | T061 workflow tests | T062 E2E/evaluation fixtures
T063 intent routing | T066 preferences | T067 context selector | T068 workflow reducer
```

### User Story 4

```text
T072 metrics access | T073 metrics shape | T074 resilience | T075 multi-instance | T076 redaction | T077 alerts
T079 metrics | T080 events | T084 alert rules | T085 runbook
```

### User Story 5

```text
T088 deployment tests | T089 evidence tests | T090 release-gate tests
T091 gateway image | T092 docs image | T095 staging checks | T096 evidence assembler
```

### User Story 6

```text
T100 budget tests | T101 cache tests | T102 cost comparison tests | T103 model-policy tests
T104 budgets | T105 cost estimator | T107 retrieval cache | T110 cost-policy documentation
```

## Implementation Strategy

### MVP First: User Story 1

1. Complete Setup and Foundation.
2. Freeze baseline evidence before remediation.
3. Implement US1's deterministic corpus, retrieval, grounding, citations, and evaluation.
4. Stop and validate the API-only MVP against held-out cases.
5. Do not publicly deploy while feature 005 or critical security/quality gates fail.

### Incremental Delivery

1. **US1**: Grounded answer API with citations and abstention.
2. **US2**: Accessible Persian-first chat consuming the metadata.
3. **US3**: Intent-aware clarification, explicit personalization, and workflows.
4. **US4**: Production security, resilience, observability, and alerting.
5. **US6**: Measured safe cost optimization.
6. **US5**: Supported-version Liara staging, rollback, and submission evidence.
7. **Polish**: Reconcile every scorecard row and run all terminating gates.

### Team Strategy

After Foundation, one teammate can own ingestion/retrieval (US1), one shared packages/UI (US2/US3),
and one operations/cost/deployment (US4/US6/US5). Contract files and the scorecard remain coordinated
merge points; implementation tasks should not mark evidence complete until the corresponding owner
has supplied a passing report.

## Notes

- `[P]` means file ownership and prerequisites permit concurrent work; it does not remove phase gates.
- Generated indexes/reports under `.artifacts/` are evidence outputs and remain gitignored.
- Evaluation cases are reviewed inputs and are tracked; provider secrets/model IDs are not.
- The active gateway remains stateless and ZarinPal remains disconnected.
- Tasks T098 and T099 may remain blocked by separate feature work or external Liara access; they must
  not be falsely checked off or bypassed.
- Stop at each checkpoint and update the scorecard from evidence, not code presence.
