---
description: "Dependency-ordered implementation tasks for integrating the AI gateway"
---

# Tasks: Integrate AI Gateway

**Input**: Design documents from `specs/006-integrate-ai-gateway/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md`

**Tests**: Required by FR-015, SC-001 through SC-004, and the constitution. Write each listed test
first and confirm it fails for the intended reason before implementing the corresponding behavior.

**Organization**: Tasks are grouped by user story so Liara chat, backend operations, and product
isolation can each be implemented and validated independently after the shared foundation.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel because it changes different files and has no dependency on another
  incomplete task in the same group.
- **[Story]**: Maps the task to User Story 1, 2, or 3 from `spec.md`.
- Every task names the files it creates or changes.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Pin both toolchains and install the test harness required by all later phases.

- [X] T001 Pin and enforce Node.js 24, pnpm 10.33.0, Python 3.12, and uv 0.8.13 in `.tool-versions`, `.nvmrc`, `.python-version`, `package.json`, and `scripts/check-toolchain.mjs`
- [X] T002 Add pinned Playwright, jsdom, Testing Library, and accessibility-test dependencies plus root `test:e2e`, `test:gateway`, and `check:toolchain` scripts in `package.json`, `packages/api-client/package.json`, `packages/chat-ui/package.json`, `packages/contracts/package.json`, and `pnpm-lock.yaml`
- [X] T003 [P] Create deterministic desktop/mobile browser projects, web-server settings, timeouts, and artifact paths in `playwright.config.ts` and `tests/e2e/fixtures/test-stack.ts`
- [X] T004 [P] Configure jsdom/unit-test setup and DOM matchers in `packages/api-client/vitest.config.ts`, `packages/chat-ui/vitest.config.ts`, `packages/chat-ui/src/test-setup.ts`, and `packages/contracts/vitest.config.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Make the gateway/browser protocol secure and testable before any product consumes it.

**⚠️ CRITICAL**: No user-story implementation begins until this phase passes.

- [X] T005 [P] Add failing CORS, optional placeholder Authorization, exposed `x-request-id`, origin-less client, and live OpenAPI/profile parity tests in `ai-gw/tests/contract/test_browser_contract.py` and `ai-gw/tests/contract/test_openapi_schema.py`
- [X] T006 [P] Add failing absolute non-stream/stream deadline, missing upstream `[DONE]`, mid-stream malformed response, and conservative reconciliation tests plus slow/trickle fixtures in `ai-gw/tests/integration/test_absolute_deadlines.py`, `ai-gw/tests/integration/test_streaming_and_disconnect.py`, and `ai-gw/tests/fixtures/mock_openai_server.py`
- [X] T007 [P] Extend trusted/untrusted proxy, forwarded-hop, spoofed identity, and raw-address redaction tests in `ai-gw/tests/security/test_header_spoofing.py`, `ai-gw/tests/unit/auth/test_network.py`, and `ai-gw/tests/unit/auth/test_anonymous_identity.py`
- [X] T008 Implement configured-origin CORS for `content-type` and optional `authorization`, expose `x-request-id`, retain origin-less access, and advertise the optional header in `ai-gw/src/ai_gateway/proxy/proxy_server.py`, `ai-gw/src/ai_gateway/proxy/endpoints/docs.py`, and `ai-gw/src/ai_gateway/proxy/endpoints/chat_completions.py`
- [X] T009 Implement wall-clock request/stream deadlines, cancellation propagation, first-upstream-marker normalization, incomplete-stream termination, response closure, and exactly-once reservation reconciliation in `ai-gw/src/ai_gateway/proxy/common_request_processing.py` and `ai-gw/src/ai_gateway/proxy/providers/openai_compatible.py`
- [X] T010 [P] Document pre-stream versus mid-stream failures, trusted-proxy deployment rules, CORS visibility, absolute deadlines, and readiness scope in `ai-gw/docs/openai-compatibility.md`, `ai-gw/docs/configuration.md`, `ai-gw/docs/anonymous-enforcement.md`, and `ai-gw/docs/observability.md`
- [X] T011 [P] Replace legacy conversation contract tests with failing model-list, completion, chunk, OpenAI-error, usage, and Liara consumer-profile cases in `packages/contracts/src/openai.test.ts` and `packages/contracts/src/consumer-profile.test.ts`
- [X] T012 [P] Add failing browser-state tests for schema versioning, UUID `turnId` pairing, role/status invariants, maximum one stream, invalid legacy state, and restored `streaming` to `stopped` normalization in `packages/contracts/src/browser-chat-state.test.ts`
- [X] T013 Implement strict Zod OpenAI consumer schemas and refined browser conversation schemas in `packages/contracts/src/openai.ts`, `packages/contracts/src/browser-chat-state.ts`, and `packages/contracts/src/index.ts`
- [X] T014 Add an automated subset/parity validator for `specs/006-integrate-ai-gateway/contracts/openapi.yaml` against the live FastAPI schema in `ai-gw/tests/contract/test_consumer_profile.py`
- [X] T015 Run and fix the foundational contract/security gates using `ai-gw/tests/contract/`, `ai-gw/tests/security/`, `ai-gw/tests/integration/test_absolute_deadlines.py`, and all tests in `packages/contracts/src/`

**Checkpoint**: The public gateway contract, browser-state contract, deadlines, CORS, proxy identity,
sanitization, and stream termination are stable; user-story work may start.

---

## Phase 3: User Story 1 - Chat from Liara Docs (Priority: P1) 🎯 MVP

**Goal**: A Liara visitor discovers the one public model, chats through OpenAI-compatible streaming,
cancels/retries safely, restores same-tab context, and receives accessible Persian recovery states.

**Independent Test**: Run Redis, bootstrap, mock upstream, gateway, and Liara only; complete initial
chat, follow-up context, cancellation, retry replacement, same-tab reload, independent-tab reset,
model-cardinality failures, and recoverable-error scenarios without `apps/api`.

### Tests for User Story 1

- [X] T016 [P] [US1] Add failing model discovery, non-streaming response, OpenAI error mapping, request-ID retention, origin validation, and credential-free request tests in `packages/api-client/src/client.test.ts`
- [X] T017 [P] [US1] Add failing LF/CRLF/comment parsing, split chunks, event/buffer/stream/text bounds, missing `[DONE]`, first-marker close, malformed chunk, and AbortSignal tests in `packages/api-client/src/sse.test.ts`
- [X] T018 [P] [US1] Add failing reducer tests for ordered `turnId` pairs, visible-context projection, stopped/failed states, retry replacement, and one-active-stream enforcement in `packages/chat-ui/src/conversation-reducer.test.ts`
- [X] T019 [P] [US1] Add failing session-storage tests for version 1 restore, bounded partial persistence, reload-during-stream normalization, legacy discard, same-tab reload, and independent-tab isolation in `packages/chat-ui/src/session-storage.test.ts`
- [X] T020 [P] [US1] Add failing component tests for model discovery once per session, incremental rendering, cancellation, retry/follow-up payloads, Persian error categories, request IDs, `aria-busy`, focus recovery, and non-repeating live announcements in `packages/chat-ui/src/ChatPanel.test.tsx`
- [X] T021 [P] [US1] Add failing desktop/mobile browser scenarios for initial chat, follow-up context, cancel/retry, same-tab reload, reload while streaming, independent `noopener` tab, and LTR code/URL islands in `tests/e2e/liara-chat.spec.ts`
- [X] T022 [P] [US1] Add failing Playwright route-interception scenarios for zero/multiple/malformed models, sanitized 400/429/502/503/504 failures, incomplete streams, and no completion dispatch after discovery failure in `tests/e2e/liara-failures.spec.ts`

### Implementation for User Story 1

- [X] T023 [US1] Implement normalized credential-free gateway origins, one-model discovery, non-streaming completion, OpenAI error classes, and safe request-ID capture in `packages/api-client/src/client.ts`, `packages/api-client/src/errors.ts`, and `packages/api-client/src/index.ts`
- [X] T024 [US1] Implement the bounded fetch-based OpenAI SSE parser and abort/reader cleanup in `packages/api-client/src/sse.ts`
- [X] T025 [US1] Implement browser message/turn state transitions, visible-context projection, stopped inclusion, failed exclusion, and deterministic retry replacement in `packages/chat-ui/src/conversation-reducer.ts`
- [X] T026 [US1] Implement versioned `sessionStorage` parsing, bounded persistence, legacy removal, and restored-stream normalization in `packages/chat-ui/src/session-storage.ts`
- [X] T027 [US1] Implement the chat controller for once-per-session discovery, streaming submission, cancellation, follow-up context, retry, persistence, and Persian-safe error mapping in `packages/chat-ui/src/use-liara-chat.ts`
- [X] T028 [US1] Refactor the shared chat surface into an accessible Liara gateway consumer with separate visual deltas/status announcements, keyboard stop/retry, focus recovery, Markdown, and request-ID support in `packages/chat-ui/src/ChatPanel.tsx` and `packages/chat-ui/src/index.tsx`
- [X] T029 [US1] Implement responsive Persian RTL presentation, stopped/failed/loading states, visible focus, and LTR code/URL islands in `packages/chat-ui/src/styles.css`
- [X] T030 [US1] Connect the Liara `/chat` route and launcher to `NEXT_PUBLIC_AI_GATEWAY_URL`, remove legacy product/conversation props, and embed the credential-free origin during static export in `apps/liara-docs/src/pages/chat.tsx`, `apps/liara-docs/src/components/ChatLauncher.tsx`, `apps/liara-docs/next.config.mjs`, and `apps/liara-docs/Dockerfile.monorepo`
- [X] T031 [US1] Add a 20-request first-visible-increment Playwright measurement requiring at least 19 results within 2 seconds in `tests/e2e/liara-stream-performance.spec.ts`
- [ ] T032 [US1] Run and fix all US1 package, Liara build, gateway contract, and desktop/mobile browser checks defined in `packages/api-client/`, `packages/chat-ui/`, `apps/liara-docs/`, and `tests/e2e/liara-*.spec.ts`

**Checkpoint**: User Story 1 is an independently runnable Liara-chat MVP against the gateway and
deterministic upstream; ZarinPal is not needed for this checkpoint.

---

## Phase 4: User Story 2 - Run One Authoritative Backend (Priority: P2)

**Goal**: A teammate runs one documented stack whose only backend is `ai-gw`, with deterministic
bootstrap, readiness ordering, mock mode, secure deployment inputs, and no active legacy service.

**Independent Test**: From a clean clone, one documented Compose command starts Redis, bootstrap,
mock upstream, gateway, Liara, and the disconnected ZarinPal shell; health/OpenAI smoke tests pass,
Redis fails readiness closed, upstream failure leaves readiness healthy, and no legacy service runs.

### Tests for User Story 2

- [X] T033 [P] [US2] Extend failing startup/readiness tests for invalid configuration, absent/mismatched bootstrap markers, Redis loss/recovery, and upstream-independent readiness in `ai-gw/tests/integration/test_readiness_failure_modes.py` and `ai-gw/tests/unit/proxy/test_proxy_config.py`
- [X] T034 [P] [US2] Add failing root/deployment Compose inventory, one-shot bootstrap, readiness-healthcheck, dependency-order, fixture-secret, and independent-overlay tests in `tests/ops/compose-config.test.ts`
- [X] T035 [P] [US2] Add a failing active-backend guard for workspace manifests, root scripts, executable source, Compose, deploy files, and onboarding in `tests/ops/authoritative-backend.test.ts`

### Implementation for User Story 2

- [X] T036 [US2] Change the gateway container health check from liveness to readiness while retaining liveness as a public process probe in `ai-gw/Dockerfile`
- [X] T037 [US2] Replace PostgreSQL/DuckDB/API variables with valid fixture-only gateway, Redis, CORS, public URL, policy, and secret examples in `.env.example` while keeping production secrets explicitly operator-owned
- [X] T038 [US2] Replace the root PostgreSQL/NestJS stack with Redis, `gateway-bootstrap`, mock upstream, gateway, Liara, and independently starting ZarinPal services using readiness-based dependencies in `compose.yaml`
- [X] T039 [US2] Create the independent Redis/bootstrap/gateway production overlay with required provider secrets, trusted ingress CIDRs, policy epoch, persistent Redis, and readiness health ordering in `deploy/compose.gateway.yaml`
- [X] T040 [US2] Replace legacy API scripts and paths with independently filterable Node and uv build/lint/type-check/test/dev commands in `package.json`, `turbo.json`, `.prettierignore`, and `CONTRIBUTING.md`
- [X] T041 [US2] Remove the superseded NestJS application and API deployment overlay from `apps/api/` and `deploy/compose.api.yaml`, then refresh `pnpm-lock.yaml` without removing their Git history
- [X] T042 [US2] Rewrite root clean-clone setup, local/native/Compose commands, environment inventory, health/OpenAI smoke tests, independent deployment commands, troubleshooting, and release block in `README.md`
- [X] T043 [US2] Align imported gateway attribution and operator instructions with root bootstrap/mock/deployment behavior in `ai-gw/README.md`, `ai-gw/compose.yaml`, and `docs/architecture/ai-gateway-upstream.md`
- [ ] T044 [US2] Build and run the root stack plus `deploy/compose.gateway.yaml`, validate liveness/readiness/model/non-stream/stream/error behavior, and record the US2 evidence in `specs/006-integrate-ai-gateway/validation.md`

**Checkpoint**: User Story 2 independently proves one authoritative, reproducible, fail-closed
backend and removes all active NestJS/PostgreSQL/DuckDB ownership from this feature's stack.

---

## Phase 5: User Story 3 - Preserve Product Boundaries (Priority: P3)

**Goal**: Preserve both pinned source histories, connect only Liara, and leave a buildable ZarinPal
shell with no gateway package, configuration, health, or network coupling.

**Independent Test**: Both pinned commits are ancestors; Liara and ZarinPal build independently;
ZarinPal renders a Persian deferred state on desktop/mobile and generates no request to the gateway.

### Tests for User Story 3

- [X] T045 [P] [US3] Add a failing static dependency/configuration guard for gateway packages, `/v1/` routes, public gateway variables, and chat styles under `apps/zarin-dashboard/` in `tests/ops/product-boundaries.test.ts`
- [ ] T046 [P] [US3] Add failing desktop/mobile ZarinPal rendering and network interception tests that reject every gateway request in `tests/e2e/zarinpal-boundary.spec.ts`
- [X] T047 [P] [US3] Add a failing pinned-ancestry and immutable-source-tip check for `ea3585676596ecd52b96746c4349ca19c68d0b4d` and `147887d23f78865fe718971a2bbd9e787bb54e72` in `scripts/check-integration-ancestry.mjs` and `tests/ops/integration-ancestry.test.ts`

### Implementation for User Story 3

- [X] T048 [US3] Remove `@hackathon/api-client`, `@hackathon/chat-ui`, and `@hackathon/contracts` dependencies, transpilation, styles, and `NEXT_PUBLIC_API_URL` build configuration from `apps/zarin-dashboard/package.json`, `apps/zarin-dashboard/next.config.mjs`, `apps/zarin-dashboard/app/layout.tsx`, and `apps/zarin-dashboard/Dockerfile`
- [X] T049 [US3] Replace the operational ZarinPal chat with an accessible Persian disabled/deferred assistant card while preserving the responsive analytics shell in `apps/zarin-dashboard/app/page.tsx` and `apps/zarin-dashboard/app/globals.css`
- [X] T050 [US3] Remove gateway URL arguments and health dependencies from the independently deployable ZarinPal definitions in `compose.yaml` and `deploy/compose.zarin.yaml`
- [X] T051 [US3] Record both pinned merge inputs, unchanged source tips, merge commit provenance, and future branch-update procedure in `docs/architecture/ai-gateway-integration.md`
- [ ] T052 [US3] Run and fix the ancestry guard, boundary guards, independent Liara/ZarinPal builds, and desktop/mobile ZarinPal browser tests in `scripts/check-integration-ancestry.mjs`, `tests/ops/`, and `tests/e2e/zarinpal-boundary.spec.ts`

**Checkpoint**: All three stories are independently functional; only Liara consumes the gateway,
and both source histories remain auditable.

---

## Phase 6: Polish & Cross-Cutting Quality Gates

**Purpose**: Execute the complete release-quality matrix and document evidence without expanding
scope into RAG, provider selection, ZarinPal analytics, authentication, or the deferred Next.js
upgrade.

- [ ] T053 [P] Run Ruff, strict mypy, all pytest unit/contract/security/parity/integration suites, and Redis atomicity/reconciliation gates; fix regressions only in `ai-gw/src/`, `ai-gw/tests/`, and `ai-gw/docs/`
- [ ] T054 [P] Run root formatting, lint, type-check, unit, contract, and production-build checks; fix regressions in `package.json`, `apps/`, `packages/`, `tests/ops/`, and `tests/e2e/`
- [ ] T055 Run all Playwright desktop/mobile chat, accessibility, isolation, and failure scenarios and retain failure artifacts only under ignored `test-results/` and `playwright-report/`
- [ ] T056 Run the exact 20-request mock-stream latency gate and record at least 19 results at or below 2 seconds in `specs/006-integrate-ai-gateway/validation.md`
- [ ] T057 Build and smoke-test every independent image plus root and deployment Compose definitions, recording image/service health evidence in `specs/006-integrate-ai-gateway/validation.md`
- [ ] T058 Execute the full clean-clone onboarding and `specs/006-integrate-ai-gateway/quickstart.md` acceptance flow, then record elapsed setup time and deviations in `specs/006-integrate-ai-gateway/validation.md`
- [ ] T059 Confirm `pnpm release:check` still blocks public deployment on Next.js 14 and document the expected gate in `README.md` and `specs/006-integrate-ai-gateway/validation.md`
- [ ] T060 Re-run pinned ancestry, active-backend, secret-redaction, provider-identity, ZarinPal non-connection, and `git diff --check` gates; set feature status complete only after all evidence passes in `specs/006-integrate-ai-gateway/spec.md` and `specs/006-integrate-ai-gateway/validation.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 — Setup**: Starts immediately. T002 follows T001 because it updates `package.json`;
  T003 and T004 can proceed in parallel after the dependency choices are fixed.
- **Phase 2 — Foundation**: Depends on Phase 1 and blocks all user stories. Tests T005–T007 and
  T011–T012 can be authored in parallel. T008 follows T005/T007; T009 follows T006; T013 follows
  T011/T012; T014 follows T005/T011; T015 closes the phase.
- **Phase 3 — US1**: Depends on Phase 2. It can run without US2 by using the imported gateway's
  Redis/mock stack and a separately started Liara frontend.
- **Phase 4 — US2**: Depends on Phase 2. It can proceed in parallel with US1 because it owns root
  orchestration/backend removal rather than the Liara state machine.
- **Phase 5 — US3**: Depends on Phase 2. It can proceed in parallel with US1/US2 except that T050
  must be reconciled with T038 if both touch `compose.yaml` concurrently.
- **Phase 6 — Polish**: Depends on every story selected for delivery; full acceptance requires all
  three stories.

### User Story Dependencies

```text
Setup -> Foundation -> US1 (Liara chat MVP) ---------\
                    -> US2 (authoritative backend) ---+-> Cross-cutting validation
                    -> US3 (product boundaries) -----/
```

- **US1 (P1)**: No dependency on US2 or US3 for its independent checkpoint.
- **US2 (P2)**: No dependency on US1 UI completion; curl/OpenAI clients validate its contract.
- **US3 (P3)**: No functional dependency on US1/US2, but its final boundary check uses their agreed
  package and Compose names.

### Within Each User Story

- Write the story's tests and confirm they fail before implementation.
- Implement schemas/state models before services/controllers.
- Implement services/parsers before UI or orchestration consumers.
- Run the independent checkpoint before starting polish or marking the story complete.

## Parallel Opportunities

### User Story 1

After Phase 2, these test groups can be assigned concurrently:

```text
T016 + T017: API client HTTP/SSE tests
T018 + T019: conversation reducer/session storage tests
T020: accessible component tests
T021 + T022: browser journey/failure tests
```

Implementation then proceeds as two coordinated lanes:

```text
T023 -> T024: gateway client and SSE parser
T025 -> T026: conversation state and persistence
(both lanes) -> T027 -> T028 -> T029 -> T030 -> T031 -> T032
```

### User Story 2

```text
T033: gateway startup/readiness tests
T034: Compose contract tests
T035: authoritative-backend guard
```

After the tests fail correctly, T036/T037 may proceed in parallel, then T038–T043 are integrated
before the T044 checkpoint.

### User Story 3

```text
T045: static product-boundary guard
T046: ZarinPal browser/network test
T047: pinned ancestry guard
```

T048 and T051 can proceed concurrently. T049 follows T048; T050 must coordinate the shared root
Compose file with US2; T052 closes the story.

## Implementation Strategy

### MVP First

1. Complete Phase 1 setup.
2. Complete Phase 2 foundation.
3. Complete US1 tasks T016–T032.
4. Stop and validate Liara chat independently against Redis/mock/gateway.
5. Demo locally only; the Next.js release gate still forbids public deployment.

### Incremental Delivery

1. **Foundation**: Secure, bounded, contract-tested gateway and browser schemas.
2. **US1**: Working Liara chat MVP.
3. **US2**: One reproducible authoritative backend and clean root stack.
4. **US3**: Auditable merge history and strict ZarinPal non-connection.
5. **Polish**: Full security, browser, performance, container, onboarding, and release-gate evidence.

### Parallel Team Strategy

After the shared foundation:

- Developer A owns US1 under `packages/api-client`, `packages/chat-ui`, and `apps/liara-docs`.
- Developer B owns US2 under `ai-gw`, root orchestration, deployment, and onboarding.
- Developer C owns US3 under `apps/zarin-dashboard`, provenance, and boundary tests.
- Coordinate `compose.yaml`, `package.json`, and `pnpm-lock.yaml` explicitly because they are shared
  integration files.

## Notes

- `[P]` means the named files do not overlap with another incomplete task's files.
- Story labels provide requirement traceability; setup/foundation/polish tasks intentionally have
  no story label.
- Do not add CI in this feature.
- Do not implement RAG, citations, provider selection, ZarinPal analytics/chat, user accounts, or
  the Next.js supported-version upgrade.
- Never commit real provider keys, raw addresses, Redis contents, `.venv`, browser artifacts, or
  generated databases.
- Commit after each task or cohesive test/implementation pair and update checkboxes only after the
  named acceptance command passes.
