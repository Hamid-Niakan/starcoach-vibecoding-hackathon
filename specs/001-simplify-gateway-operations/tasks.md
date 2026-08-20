---

description: "Dependency-ordered implementation tasks for the simplified single-model AI gateway"
---

# Tasks: Simplified Gateway Operations

**Input**: Design documents from `specs/003-simplify-gateway-operations/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md`

**Tests**: Contract, unit, integration, security, parity, and performance tests are included because the feature specification defines explicit independent-test scenarios and measurable release criteria. Within each story, write the listed tests first and confirm they fail for the expected reason before implementation.

**Organization**: Tasks are grouped by user story. Paths and identifiers follow the gateway terminology policy in `plan.md`; no external gateway runtime may become a dependency.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel because it owns different files and has no dependency on another incomplete task in the same group
- **[Story]**: Maps the task to User Story 1, 2, or 3
- Every task includes an exact repository-relative file path

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create the independently packaged Python service, deterministic toolchain, local dependencies, and reusable test fixtures.

- [X] T001 Create the planned package, test, documentation, deployment, and static-asset directory skeleton with `__init__.py` files under `ai-gw/src/ai_gateway/` and `ai-gw/tests/`
- [X] T002 Define Python 3.12 runtime dependencies, development dependencies, console entry points, build metadata, Ruff, mypy, and pytest configuration in `ai-gw/pyproject.toml`
- [X] T003 [P] Add safe non-secret destination and enforcement examples in `ai-gw/.env.example` and pin Python 3.12 in `ai-gw/.python-version`
- [X] T004 [P] Add the one-worker production image and build exclusions in `ai-gw/Dockerfile` and `ai-gw/.dockerignore`
- [X] T005 [P] Define local gateway, Redis, mock-provider, and Prometheus services plus persistent/noeviction Redis and scrape configuration in `ai-gw/compose.yaml`, `ai-gw/deploy/redis/redis.conf`, and `ai-gw/deploy/prometheus/prometheus.yml`
- [X] T006 [P] Create the controllable OpenAI-compatible JSON/SSE fixture provider in `ai-gw/tests/fixtures/mock_openai_server.py`
- [X] T007 [P] Add split-frame, malformed-frame, usage, timeout, and disconnect fixtures in `ai-gw/tests/fixtures/sse_payloads.py`
- [X] T008 [P] Define unique secret, content, address, header, model, and error canaries for sanitization tests in `ai-gw/tests/fixtures/sensitive_canaries.py`
- [X] T009 Resolve and commit the deterministic dependency lock after T002 in `ai-gw/uv.lock`

**Checkpoint**: The package installs, test discovery works, and local service definitions parse without implementing gateway behavior.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Implement configuration, common OpenAI/error types, request context, network identity, safety middleware, and application lifecycle wiring required by every user story.

**⚠️ CRITICAL**: No user-story implementation starts until this phase passes.

### Foundational tests

- [X] T010 [P] Write failing tests for immutable destination configuration, exact `AI_GATEWAY_*` parsing, placeholder/list rejection, URL policy, and secret-safe failures in `ai-gw/tests/unit/proxy/test_proxy_config.py`
- [X] T011 [P] Write failing trusted-proxy, canonical IP, spoof-resistance, and deterministic HMAC identity tests in `ai-gw/tests/unit/auth/test_network.py` and `ai-gw/tests/unit/auth/test_anonymous_identity.py`
- [X] T012 [P] Write failing generated-request-ID, inbound-ID overwrite, context cleanup, header injection, exception, and cancellation tests in `ai-gw/tests/unit/middleware/test_request_context_middleware.py`
- [X] T013 [P] Write failing pure-ASGI size-limit, security-header, and in-flight cleanup tests in `ai-gw/tests/unit/middleware/test_request_size_limit_middleware.py`, `ai-gw/tests/unit/middleware/test_security_headers_middleware.py`, and `ai-gw/tests/unit/middleware/test_in_flight_requests_middleware.py`
- [X] T014 [P] Write failing OpenAI-style error envelope and bounded error-code contract tests in `ai-gw/tests/contract/test_error_contract.py`

### Foundational implementation

- [X] T015 Implement frozen destination, enforcement, transport, and observability settings with scalar-only environment loading and startup validation in `ai-gw/src/ai_gateway/proxy/proxy_config.py`
- [X] T016 [P] Define shared constants, `ProxyException`, bounded error categories, OpenAI error schemas, and exception-to-status mapping in `ai-gw/src/ai_gateway/proxy/constants.py`, `ai-gw/src/ai_gateway/proxy/errors.py`, and `ai-gw/src/ai_gateway/proxy/_types.py`
- [X] T017 [P] Implement `NetworkContext`, `TrustedProxyConfig`, `normalize_cidr_ranges`, `parse_trusted_proxy_ranges`, `ip_in_networks`, `resolve_client_ip`, and `resolve_network_context` in `ai-gw/src/ai_gateway/proxy/auth/network.py`
- [X] T018 Implement canonical IP normalization and deployment-keyed `client_id` derivation without an authentication principal in `ai-gw/src/ai_gateway/proxy/auth/anonymous_identity.py`
- [X] T019 [P] Implement pure-ASGI `RequestContextMiddleware` with gateway-owned UUIDs, namespaced scope state, contextvars, response/outbound `x-request-id`, and guaranteed cleanup in `ai-gw/src/ai_gateway/proxy/middleware/request_context_middleware.py`
- [X] T020 [P] Implement pure-ASGI `RequestSizeLimitMiddleware`, `SecurityHeadersMiddleware`, and lifecycle-safe `InFlightRequestsMiddleware` in `ai-gw/src/ai_gateway/proxy/middleware/request_size_limit_middleware.py`, `ai-gw/src/ai_gateway/proxy/middleware/security_headers_middleware.py`, and `ai-gw/src/ai_gateway/proxy/middleware/in_flight_requests_middleware.py`
- [X] T021 Wire `create_app`, middleware ordering, lifespan resource ownership, exception handlers, and CLI/ASGI entry points in `ai-gw/src/ai_gateway/proxy/proxy_server.py`, `ai-gw/src/ai_gateway/main.py`, and `ai-gw/src/ai_gateway/__main__.py`
- [X] T022 Run the foundational suite and fix only foundational code until `uv run pytest tests/unit/proxy/test_proxy_config.py tests/unit/auth tests/unit/middleware tests/contract/test_error_contract.py -q` passes from `ai-gw/`

**Checkpoint**: The gateway starts from one validated immutable configuration, produces safe errors and request IDs, and has no chat, model, documentation, or monitoring routes yet.

---

## Phase 3: User Story 1 - Configure One Chat Destination (Priority: P1) 🎯 MVP

**Goal**: Configure exactly one OpenAI-compatible destination, list exactly its public `model_name`, and serve compatible non-streaming/streaming chat through one fail-closed, quota-enforced upstream path.

**Independent Test**: Start with one valid configuration, assert `GET /v1/models` returns exactly one public alias without upstream traffic, call `POST /v1/chat/completions` with that alias, and prove every accepted request reaches only the fixed API base using the protected upstream model; invalid or ambiguous configuration/model input fails before dispatch.

### Tests for User Story 1

- [X] T023 [P] [US1] Write failing OpenAPI-derived contract tests for the static model list, non-streaming chat, SSE chat, validation errors, limit errors, and upstream errors in `ai-gw/tests/contract/test_routes_models.py` and `ai-gw/tests/contract/test_routes_chat_completions.py`
- [X] T024 [P] [US1] Write failing Pydantic tests for `ProxyChatCompletionRequest`, role/content/tool/structured-output validation, `ModelResponse`, `ModelResponseStream`, `Usage`, and forbidden routing extras in `ai-gw/tests/unit/proxy/test_proxy_types.py`
- [X] T025 [P] [US1] Write failing fixed-destination, SSRF, redirect, environment-proxy, header allowlist, credential isolation, and model-rewrite tests in `ai-gw/tests/security/test_destination_lock.py` and `ai-gw/tests/security/test_header_spoofing.py`
- [X] T026 [P] [US1] Write failing OpenAI client compatibility tests for `models.list()` and non-streaming chat, tools, tool results, multimodal messages, response formats, and usage in `ai-gw/tests/integration/test_openai_client_compatibility.py`
- [X] T027 [P] [US1] Write failing SSE framing, first-byte error, split-event, single-`[DONE]`, model rewrite, final usage, timeout, malformed stream, and disconnect cleanup tests in `ai-gw/tests/integration/test_streaming_and_disconnect.py`
- [X] T028 [P] [US1] Write failing real-Redis boundary and concurrent admission tests for client/global RPM, TPM, concurrency, and quota in `ai-gw/tests/integration/test_rate_limiter_toctou.py`
- [X] T029 [P] [US1] Write failing two-instance atomicity, Redis-time window, stale lease, `NOSCRIPT`, ambiguous-write, restart, and no-local-fallback tests in `ai-gw/tests/integration/test_multi_instance_atomicity.py`
- [X] T030 [P] [US1] Write failing reservation tests for conservative admitted-request charging, actual-usage delta, idempotent reconciliation, late-window isolation, and tombstone expiry in `ai-gw/tests/integration/test_reservation_reconciliation.py`
- [X] T031 [P] [US1] Write failing readiness tests for bootstrap marker, epoch/fingerprint mismatch, Redis outage, script failure, drain state, and recovery in `ai-gw/tests/integration/test_readiness_failure_modes.py`
- [X] T032 [P] [US1] Implement retained chat schema, streaming, error, and client-compatibility cases as black-box parity tests

### Implementation for User Story 1

- [X] T033 [P] [US1] Complete `ProxyChatCompletionRequest`, OpenAI message/tool/format types, `ModelResponse`, `ModelResponseStream`, `Usage`, `ModelInfoResponse`, and list response schemas in `ai-gw/src/ai_gateway/proxy/_types.py`
- [X] T034 [P] [US1] Implement `UsagePolicy`, `RateLimitType`, window/lease types, `AdmissionDecision`, `UsageReservation`, and reconciliation enums in `ai-gw/src/ai_gateway/proxy/enforcement/_types.py` and `ai-gw/src/ai_gateway/proxy/enforcement/usage_policy.py`
- [X] T035 [P] [US1] Implement provider-declared worst-case input reservation, effective maximum-output calculation, and trustworthy provider usage extraction in `ai-gw/src/ai_gateway/proxy/enforcement/usage_estimator.py`
- [X] T036 [P] [US1] Centralize same-slot enforcement key construction, TTL calculation, result enums, `SCRIPT LOAD`/`EVALSHA`, and reload-on-`NOSCRIPT` behavior in `ai-gw/src/ai_gateway/proxy/enforcement/redis_keys.py` and `ai-gw/src/ai_gateway/proxy/enforcement/redis_scripts.py`
- [X] T037 [P] [US1] Implement atomic Redis-time admission across client/global RPM, TPM, concurrency, quota, epoch validation, and reservation creation in `ai-gw/src/ai_gateway/proxy/enforcement/scripts/admit.lua`
- [X] T038 [P] [US1] Implement atomic idempotent actual/conservative reconciliation, under-reservation latching, lease release, and minimal tombstones in `ai-gw/src/ai_gateway/proxy/enforcement/scripts/reconcile.lua`
- [X] T039 [US1] Implement authoritative `RedisEnforcementStore`, finite timeouts, fail-closed ambiguity handling, readiness checks, and no cache/local fallback in `ai-gw/src/ai_gateway/proxy/enforcement/redis_store.py`
- [X] T040 [US1] Implement `ParallelRequestLimiter`, conservative reservation handling, reconciliation orchestration, and safe `Retry-After` mapping in `ai-gw/src/ai_gateway/proxy/enforcement/parallel_request_limiter.py` and `ai-gw/src/ai_gateway/proxy/enforcement/usage_reservation.py`
- [X] T041 [US1] Implement the idempotent deployment marker/epoch/identity-fingerprint operator command in `ai-gw/src/ai_gateway/proxy/enforcement/bootstrap.py`
- [X] T042 [P] [US1] Implement the single pooled HTTPX provider client with fixed `api_base`, fresh header allowlist, protected `api_key`, fixed `model`, TLS, no redirects, `trust_env=False`, bounds, and explicit stream closing in `ai-gw/src/ai_gateway/proxy/providers/openai_compatible.py`
- [X] T043 [US1] Implement `ProxyBaseLLMRequestProcessing` for validate → identity → reserve → dispatch → reconcile, plus non-streaming `create_response` normalization and sanitized failures in `ai-gw/src/ai_gateway/proxy/common_request_processing.py`
- [X] T044 [US1] Implement `chat_completion` with exact `model_name` matching, request-body bounds, one upstream attempt, JSON results, and OpenAI error behavior in `ai-gw/src/ai_gateway/proxy/endpoints/chat_completions.py`
- [X] T045 [US1] Add streaming response generation to `create_response` with status inspection, incremental SSE parsing, ordered frames, public-model rewrite, one `[DONE]`, trustworthy usage extraction, cancellation, and `finally` cleanup in `ai-gw/src/ai_gateway/proxy/common_request_processing.py`
- [X] T046 [P] [US1] Implement the static one-entry `model_list` route from `ProxyConfig.model_name` with no Redis/provider call in `ai-gw/src/ai_gateway/proxy/endpoints/models.py`
- [X] T047 [P] [US1] Implement internal readiness state plus sanitized `health_liveness` and `health_readiness` status responses in `ai-gw/src/ai_gateway/proxy/endpoints/health.py`
- [X] T048 [US1] Register only chat, model-list, liveness, and readiness handlers; construct one HTTPX client and Redis store in lifespan; preload scripts; verify the marker; and drain safely in `ai-gw/src/ai_gateway/proxy/proxy_server.py`
- [X] T049 [US1] Run all US1 contract, unit, integration, security, and chat-parity tests and fix the US1 implementation until they pass from `ai-gw/`

**Checkpoint**: The MVP is deployable and independently proves one immutable model, one provider, OpenAI-compatible model listing/chat, atomic anonymous enforcement, and no alternate routing.

---

## Phase 4: User Story 2 - Explore the API Without an Application UI (Priority: P2)

**Goal**: Make public self-hosted Swagger the only browser-facing interface and document the exact supported chat, model-list, and sanitized health contracts without leaking configuration or live data.

**Independent Test**: Open `/docs` anonymously, exercise the model-list and non-streaming chat operations, verify `/openapi.json` advertises only the four supported API operations with sanitized examples, and prove root, ReDoc, UI, dashboard, management, analytics, and legacy routes return normalized 404 responses without redirects.

### Tests for User Story 2

- [X] T050 [P] [US2] Write failing OpenAPI 3.1 validation, four-operation inventory, schema-reference, operation-ID, JSON/SSE response, and sanitized-example tests in `ai-gw/tests/contract/test_openapi_schema.py`
- [X] T051 [P] [US2] Write failing self-hosted Swagger asset, no-CDN, public-access, Try-it-out, streaming-guidance, and ReDoc-disabled tests in `ai-gw/tests/contract/test_swagger_assets.py`
- [X] T052 [P] [US2] Write failing route/static-asset inventory tests for root, aliases, model detail, non-chat APIs, management routes, dashboards, analytics, and redirects in `ai-gw/tests/contract/test_public_route_inventory.py`
- [X] T053 [P] [US2] Write failing OpenAPI/Swagger canary scans for credentials, internal addresses, protected destination settings, raw client data, live totals, and provider errors in `ai-gw/tests/security/test_public_surface_sanitization.py`

### Implementation for User Story 2

- [X] T054 [P] [US2] Add complete FastAPI schema metadata, stable operation IDs, request/response examples, error categories, anonymous-limit descriptions, and streaming guidance to `ai-gw/src/ai_gateway/proxy/endpoints/chat_completions.py`, `ai-gw/src/ai_gateway/proxy/endpoints/models.py`, and `ai-gw/src/ai_gateway/proxy/endpoints/health.py`
- [X] T055 [P] [US2] Vendor the pinned Swagger bundle and document its integrity/update procedure in `ai-gw/src/ai_gateway/proxy/static/swagger/swagger-ui.css`, `ai-gw/src/ai_gateway/proxy/static/swagger/swagger-ui-bundle.js`, and `ai-gw/src/ai_gateway/proxy/static/swagger/README.md`
- [X] T056 [US2] Implement `mount_swagger_ui`, fixed `/docs` and `/openapi.json`, `redoc_url=None`, local assets, and no external browser requests in `ai-gw/src/ai_gateway/proxy/endpoints/docs.py`
- [X] T057 [US2] Register only the documented Swagger/OpenAPI/assets surface, normalize unknown routes to safe 404s, and prevent obsolete redirects in `ai-gw/src/ai_gateway/proxy/proxy_server.py`
- [X] T058 [US2] Run all US2 contract/security tests and compare the generated schema with `specs/003-simplify-gateway-operations/contracts/openapi.yaml` until the story passes independently from `ai-gw/`

**Checkpoint**: Swagger is the sole browser UI, every supported operation is discoverable, and no excluded surface or protected value is exposed.

---

## Phase 5: User Story 3 - Monitor Through Metrics and Logs (Priority: P2)

**Goal**: Expose sanitized process-local Prometheus metrics, emit bounded correlated JSON logs, preserve fixed health behavior, and prove monitoring failures never affect chat/enforcement or create gateway-owned statistics.

**Independent Test**: Exercise success, validation/model rejection, every limit rejection, cancellation, timeout, malformed/upstream failure, and log-sink pressure; scrape metrics and capture logs; verify exact-once bounded accounting and request-ID correlation with zero protected data or gateway-owned completed-request history.

### Tests for User Story 3

- [X] T059 [P] [US3] Write failing metric family, type, bucket, label-enum, zero-initialization, cardinality, private-registry, restart-reset, and exact-once tests in `ai-gw/tests/contract/test_metrics_contract.py` and `ai-gw/tests/unit/observability/test_prometheus.py`
- [X] T060 [P] [US3] Write failing JSON event schema, field type, severity, model mismatch, allowlist, content/secret/IP/error/stack redaction, and log-injection tests in `ai-gw/tests/contract/test_logging_contract.py` and `ai-gw/tests/unit/observability/test_logging_redaction.py`
- [X] T061 [P] [US3] Write failing bounded queue, drop-new, sink/serialization error, non-recursive emergency notice, and bounded-shutdown-drain tests in `ai-gw/tests/unit/observability/test_log_queue.py`
- [X] T062 [P] [US3] Write failing full-stream metrics/log finalization, generated request-ID correlation, token exact-once, and cancellation classification tests in `ai-gw/tests/integration/test_stream_observability.py`
- [X] T063 [P] [US3] Write failing collector absence, blocked/full log sink, metrics restart, and observability failure-isolation tests in `ai-gw/tests/integration/test_observability_failure_isolation.py`
- [X] T064 [P] [US3] Write failing public metrics/health/log/OpenAPI/error canary scans and no-default-collector assertions in `ai-gw/tests/security/test_public_surface_sanitization.py`
- [X] T065 [P] [US3] Write failing Redis TTL/key-shape and artifact/route/dependency tests proving no stored statistics, UI, router, tracing, database, or analytics subsystem in `ai-gw/tests/security/test_removed_routes_and_artifacts.py`

### Implementation for User Story 3

- [X] T066 [P] [US3] Define closed metric/log outcome, failure, limit, severity, event, and drop-reason enums plus typed request outcome state in `ai-gw/src/ai_gateway/proxy/observability/events.py`
- [X] T067 [P] [US3] Implement `PrometheusLogger` with a private `CollectorRegistry`, the exact metric families/buckets/labels, zero initialization, and typed recording methods in `ai-gw/src/ai_gateway/proxy/observability/prometheus.py`
- [X] T068 [P] [US3] Implement request-ID context helpers and standard-library `ProxyLogging` with schema-first allowlisting, bounds, control-character normalization, redaction defense, JSON rendering, and Uvicorn integration in `ai-gw/src/ai_gateway/proxy/observability/context.py` and `ai-gw/src/ai_gateway/proxy/observability/logging.py`
- [X] T069 [US3] Implement the bounded non-blocking queue/listener runtime, drop counters, rate-limited constant stderr fallback, and bounded drain in `ai-gw/src/ai_gateway/proxy/observability/log_queue.py`
- [X] T070 [US3] Extend pure-ASGI lifecycle middleware to capture response start/final body/disconnect/send failure, finalize exactly once, keep chat in-flight through streaming, and exclude model/docs/health/metrics from chat totals in `ai-gw/src/ai_gateway/proxy/middleware/in_flight_requests_middleware.py` and `ai-gw/src/ai_gateway/proxy/middleware/request_context_middleware.py`
- [X] T071 [P] [US3] Expose only the custom registry at public `GET /metrics` with no-store/nosniff headers and bounded scrape concurrency in `ai-gw/src/ai_gateway/proxy/endpoints/metrics.py`
- [X] T072 [US3] Instrument admission, upstream lifetime, bounded failure/limit categories, trustworthy input/output usage, readiness, and canonical completion events in `ai-gw/src/ai_gateway/proxy/common_request_processing.py`, `ai-gw/src/ai_gateway/proxy/enforcement/parallel_request_limiter.py`, and `ai-gw/src/ai_gateway/proxy/providers/openai_compatible.py`
- [X] T073 [US3] Start/stop `ProxyLogging`, initialize `PrometheusLogger`, mount `/metrics`, drive readiness gauge transitions, disable trace/access-log leakage, and keep observability failures non-fatal in `ai-gw/src/ai_gateway/proxy/proxy_server.py`
- [X] T074 [US3] Run all US3 contract, unit, integration, and security tests and fix observability behavior until the story passes independently from `ai-gw/`

**Checkpoint**: External metrics/log collectors have complete bounded signals, public operational endpoints are sanitized, monitoring failure is isolated, and the gateway stores no completed-request analytics.

---

## Phase 6: Polish & Cross-Cutting Release Gates

**Purpose**: Finish operator documentation, reference traceability, deployment hardening, security scans, performance criteria, and the complete quickstart.

- [X] T075 [P] Document every environment variable, startup-only activation, secret handling, invalid shape, and bootstrap workflow in `ai-gw/docs/configuration.md`
- [X] T076 [P] Document supported OpenAI client fields, one-model discovery, JSON/SSE behavior, errors, compatibility limits, and frontend base-URL usage in `ai-gw/docs/openai-compatibility.md`
- [X] T077 [P] Document anonymous identity, Redis authority/durability, admission, reconciliation, TTL, fail-closed behavior, and no-statistics boundary in `ai-gw/docs/anonymous-enforcement.md`
- [X] T078 [P] Document Prometheus scrape/reset semantics, metric schema, JSON log schema, request-ID diagnosis, queue degradation, external retention, and absence of tracing/UI in `ai-gw/docs/observability.md`
- [X] T079 Create the source/test/exclusion matrix for every retained chat, streaming, network, middleware, error, limit, and redaction control
- [X] T080 Implement remaining gateway security-control assertions from T079 in the parity test suite
- [X] T081 Harden and validate the one-worker image, non-root runtime, healthcheck, secret-safe layers, Redis persistence/noeviction, and Prometheus scrape setup in `ai-gw/Dockerfile`, `ai-gw/compose.yaml`, `ai-gw/deploy/redis/redis.conf`, and `ai-gw/deploy/prometheus/prometheus.yml`
- [X] T082 [P] Add the 10,000-decision two-instance boundary and zero-over-admission release test in `ai-gw/tests/performance/test_atomic_limit_boundaries.py`
- [X] T083 [P] Add the monitoring-overhead, 1,000-request correlation, log-sink-pressure, and time-to-first-response/event release tests in `ai-gw/tests/performance/test_monitoring_overhead.py`
- [X] T084 Add the 24-hour active-state expiry/no-history validation to `ai-gw/tests/integration/test_reservation_reconciliation.py` behind an explicit long-running marker
- [X] T085 Run every command and assertion in `specs/003-simplify-gateway-operations/quickstart.md`, correcting only implementation/docs drift and recording the final commands in `ai-gw/README.md`
- [X] T086 Run `uv sync --frozen`, all non-performance tests, parity tests, security scans, performance gates, OpenAPI validation, and dependency/route/artifact inventories from `ai-gw/`; resolve failures without broadening the planned surface

**Checkpoint**: All specification success criteria and inherited security/compatibility requirements are demonstrably satisfied.

---

## Dependencies & Execution Order

### Phase dependencies

- **Phase 1 — Setup**: Starts immediately.
- **Phase 2 — Foundational**: Depends on Phase 1 and blocks all user stories.
- **Phase 3 — US1**: Depends on Phase 2 and is the MVP.
- **Phase 4 — US2**: Depends on US1 schemas/routes so Swagger documents real behavior; its tests and asset work may start after Phase 2.
- **Phase 5 — US3**: Depends on the US1 request/enforcement/stream lifecycle for final instrumentation; its contract/unit tests may start after Phase 2 and can run alongside US2.
- **Phase 6 — Polish**: Depends on every story selected for release.

### User-story dependency graph

```text
Setup → Foundational → US1 (MVP)
                         ├──→ US2 (Swagger-only interface)
                         └──→ US3 (metrics, logs, monitoring)
                                  \
                         US2 ──────→ Polish and release gates
```

### Within each story

1. Write the listed tests and confirm they fail for the intended missing behavior.
2. Implement types and pure policy before stateful services.
3. Implement Redis/provider/logging integrations before route wiring.
4. Wire endpoints and lifespan only after their dependencies exist.
5. Run the story-specific suite and satisfy its independent test before proceeding.

### Parallel opportunities

- In Setup, T003–T008 are independent after the directory skeleton exists; T009 follows T002.
- In Foundational, T010–T014 can be written in parallel; T016, T017, T019, and T020 own separate modules after their tests exist.
- In US1, T023–T032 can be authored in parallel; T034–T038 and T042 own separate policy/script/provider files after shared types stabilize.
- After US1, US2 and US3 can proceed concurrently.
- In US2, schema tests, asset tests, route inventory, and security scans are independent; endpoint annotations and vendored assets are also independent.
- In US3, metrics, logging, queue, integration, and artifact tests are independent; typed events, metrics, and logging processors can be implemented in parallel.
- In Polish, T075–T078, T082, and T083 own independent files.

---

## Parallel Example: User Story 1

```text
Task T023: Contract tests in tests/contract/test_routes_models.py and test_routes_chat_completions.py
Task T025: Fixed-destination/header security tests in tests/security/
Task T027: Streaming/disconnect tests in tests/integration/test_streaming_and_disconnect.py
Task T028: Redis boundary tests in tests/integration/test_rate_limiter_toctou.py
Task T032: chat compatibility cases in the parity test suite
```

## Parallel Example: User Story 2

```text
Task T050: OpenAPI schema contract tests
Task T051: Swagger asset/browser contract tests
Task T052: Public route inventory tests
Task T053: Documentation sanitization security tests
Task T055: Pinned Swagger assets and update documentation
```

## Parallel Example: User Story 3

```text
Task T059: Prometheus contract and unit tests
Task T060: Structured logging contract and redaction tests
Task T061: Logging queue failure tests
Task T062: Stream observability integration tests
Task T065: No-statistics and removed-artifact tests
```

---

## Implementation Strategy

### MVP first

1. Complete Setup (T001–T009).
2. Complete Foundational work (T010–T022).
3. Complete US1 (T023–T049).
4. Stop and run the US1 independent test: one listed model, one accepted chat destination, invalid alternatives rejected before dispatch, and Redis enforcement correct across replicas.
5. Deploy/demo this API-only MVP if Swagger and external monitoring are not yet required for that environment.

### Incremental delivery

1. **MVP**: Setup + Foundational + US1 provides the functional OpenAI-compatible gateway.
2. **Discoverability increment**: US2 adds the only browser interface and exact public API documentation.
3. **Operations increment**: US3 adds Prometheus, structured logging, monitoring failure isolation, and no-statistics proof.
4. **Release hardening**: Polish completes reference traceability, documentation, deployment, performance, longevity, and full quickstart gates.

### Suggested ownership when parallelizing

- Developer A: US1 request schemas, fixed provider transport, and chat/streaming.
- Developer B: US1 Redis enforcement and reconciliation.
- Developer C: After US1, US2 Swagger/OpenAPI while Developer A/B begin US3 observability.
- All owners reunite for the parity matrix, security artifact audit, performance gates, and quickstart.

## Notes

- `[P]` means separate file ownership and no dependency on another incomplete task in the same group.
- Story labels provide requirement traceability; setup, foundational, and polish tasks intentionally have no story label.
- No external gateway implementation is imported, vendored, or installed by these tasks.
- The endpoint function name `model_list` is permitted; a plural/mutable model configuration list is prohibited.
- No task may add a custom UI, ReDoc, dynamic router, fallback, provider registry, management API, tracing SDK, relational database, stored statistics, remote log sink, or unbounded metric/log field.
- Commit after each task or cohesive test/implementation pair, and stop at each checkpoint for independent validation.
