# Implementation Plan: Simplified Gateway Operations

**Branch**: `003-simplify-gateway-operations` | **Date**: 2026-08-20 | **Spec**: [spec.md](./spec.md)

**Input**: Consolidated feature specification from `specs/003-simplify-gateway-operations/spec.md`

## Summary

Build an independent Python service in `ai-gw/` with a deliberately narrow public surface. The service exposes one anonymous OpenAI-compatible `POST /v1/chat/completions` route, a static one-entry `GET /v1/models` compatibility response, public self-hosted Swagger documentation, sanitized public health and Prometheus endpoints, and JSON structured logs. One immutable startup configuration maps one public model name to one fixed upstream OpenAI-compatible provider/model. Redis is the only state dependency and stores expiring, pseudonymous rate-limit, quota, concurrency, and reservation state; it is never used as historical analytics storage.

The request path is deliberately fixed: validate and normalize input, derive a pseudonymous client identity, atomically reserve allowance in Redis, call the configured upstream once through a shared HTTP client, stream or return the compatible response, then idempotently reconcile the reservation and emit bounded metrics plus one canonical content-free outcome log. No third-party gateway runtime, relational statistics store, model router, fallback, custom UI, stored spend records, or tracing subsystem is included.

## Technical Context

**Language/Version**: Python 3.12

**Primary Dependencies**: FastAPI and Uvicorn for ASGI serving and OpenAPI; Pydantic and pydantic-settings for strict schemas and immutable startup configuration; HTTPX for the single pooled upstream client and streaming; redis-py for async Redis access; prometheus-client with an explicit custom registry; standard-library logging/context variables plus orjson for bounded JSON Lines logs. The OpenAI client and OpenAPI validator are development-only compatibility tools; `hiredis` remains optional pending profiling.

**Storage**: Redis 7+ only, with persistence enabled in deployment and `noeviction`; keys contain expiring enforcement windows and idempotent reservations, never conversation content or completed-request analytics. No relational database, file-backed statistics, or gateway-owned log/metric retention.

**Testing**: pytest, pytest-asyncio, HTTPX ASGITransport, respx or an in-process mock OpenAI-compatible upstream, a real Redis test service for Lua atomicity, openapi-spec-validator for the published contract, Prometheus text parsing/promtool checks, concurrency and two-instance integration tests, standalone security-control tests, and representative load tests

**Target Platform**: Linux OCI container, one Uvicorn worker per process, horizontally replicated behind a trusted ingress; local Docker Compose includes the gateway, Redis, and a mock upstream

**Project Type**: Single backend web service with no custom frontend

**Performance Goals**: At least 95% of accepted requests add no more than 250 ms to time-to-first-response/event versus the same direct upstream request; monitoring adds no more than 5% median gateway processing overhead; 10,000 mixed concurrent boundary decisions across at least two gateway instances produce no over-admission

**Constraints**: One provider, one upstream model, one public model name, a static one-entry OpenAI-compatible model list, startup-only configuration, anonymous callers, exact model-name match, streaming and non-streaming chat, fail-closed Redis enforcement, public but sanitized Swagger/health/metrics, bounded metric labels, content-free logs, no distributed tracing, no historical statistics, no dynamic management endpoint, and no imported gateway runtime

**Scale/Scope**: Personal-use traffic with horizontal replica support; one process per replica; per-client and gateway-wide RPM, TPM, concurrency, and resettable token quota; public route inventory limited to chat, the static one-model list, liveness, readiness, metrics, Swagger, its OpenAPI document, and required Swagger static assets

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

The constitution file is still an unratified placeholder: principle names, governance rules, dates, and version are unset. It therefore supplies no enforceable project gates. Planning proceeds with the consolidated feature specification as the governing requirements.

- **Pre-research gate**: PASS. The design is contained in the required `ai-gw/` boundary, introduces one service and one enforcement-state dependency, and records why each dependency exists.
- **Scope gate**: PASS. The plan excludes all provider/model routing, management, analytics, custom UI, and tracing capabilities removed by the specification.
- **Security gate**: PASS. The request path is fail-closed, uses fixed outbound routing, strips caller-controlled forwarding/authentication headers, pseudonymizes client identity, and has a standalone security-control contract.
- **Verification gate**: PASS. Contract, integration, concurrency, streaming, observability, secret-scanning, route-inventory, and security-parity tests are first-class design outputs.
- **Post-design re-check**: PASS after research corrections. Phase 1 now includes epoch/policy-isolated Redis state, provider-neutral worst-case reservation, complete resource bounds, live readiness, explicit public-surface compensation, strict external contracts, and a security-parity matrix pinned to the reference commit. No unresolved clarification or unjustified subsystem remains.

## Gateway Terminology and Naming Policy

The gateway uses stable names that describe its fixed OpenAI-compatible request path without suggesting excluded routing, management, billing, or analytics subsystems.

| Concept | Planned identifier | Boundary |
|---|---|---|
| Frozen root configuration | `ProxyConfig` | No file reload, database configuration, router, or model list |
| Single configured model | `model_name` plus private destination settings | No plural model configuration |
| Public alias | `model_name` | Exact caller match and safe public projection |
| Protected provider/model data | private destination fields | Never exposed in public output or logs |
| Chat request | `ProxyChatCompletionRequest` | Retains only supported OpenAI fields and forbids routing/cache/fallback extras |
| Chat responses | `ModelResponse`, `ModelResponseStream`, `Usage` | Schemas are limited to the published contract |
| Model-list item | `ModelInfoResponse` | One immutable OpenAI-compatible public projection |
| Route handlers | `chat_completion`, `model_list`, `health_liveness`, `health_readiness` | Only canonical routes are registered |
| Request orchestration | `ProxyBaseLLMRequestProcessing`, `create_response` | Small fixed pipeline rather than a generic router or callback engine |
| Network trust | `NetworkContext`, `TrustedProxyConfig`, `resolve_client_ip`, `resolve_network_context` | Explicit trusted-ingress boundary |
| Middleware | `RequestSizeLimitMiddleware`, `SecurityHeadersMiddleware`, `InFlightRequestsMiddleware` | Pure-ASGI lifecycle behavior where streaming requires it |
| Logging and metrics owners | `ProxyLogging`, `PrometheusLogger` | Local bounded implementations with no callback plugins, dynamic labels, or storage |
| Limit vocabulary | `RateLimitType`, `AdmissionDecision`, `UsageReservation`, `reserved_tokens`, `actual_tokens`, `retry_after` | Quota and usage terminology rather than billing terminology |

Destination variables use the `AI_GATEWAY_` prefix: `AI_GATEWAY_MODEL_NAME`, `AI_GATEWAY_MODEL`, `AI_GATEWAY_API_BASE`, and `AI_GATEWAY_API_KEY`. Prohibited implementation concepts include generic routers, deployments, mutable model lists, end-user key/auth models, teams, organizations, spend/budget records, dynamic callbacks, fallbacks, and UI/analytics types. The endpoint function `model_list` is allowed; mutable or plural model configuration is not.

## Project Structure

### Documentation (this feature)

```text
specs/003-simplify-gateway-operations/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── configuration.md
│   ├── errors-and-streaming.md
│   ├── logging.md
│   ├── metrics.md
│   ├── openapi.yaml
│   └── security-parity.md
└── tasks.md                 # Created later by $speckit-tasks
```

### Overall Repository and Service Tree

```text
.
├── ai-gw/                                  # New independent service
│   ├── pyproject.toml
│   ├── uv.lock
│   ├── README.md
│   ├── .python-version
│   ├── .env.example
│   ├── .dockerignore
│   ├── Dockerfile
│   ├── compose.yaml
│   ├── deploy/
│   │   ├── prometheus/
│   │   │   └── prometheus.yml              # Local validation scrape config; no dashboard
│   │   └── redis/
│   │       └── redis.conf                   # Persistence/noeviction validation profile
│   ├── docs/
│   │   ├── configuration.md
│   │   ├── openai-compatibility.md
│   │   ├── anonymous-enforcement.md
│   │   ├── observability.md
│   │   └── security-control-map.md          # Local control/test coverage and exclusions
│   ├── src/
│   │   └── ai_gateway/
│   │       ├── __init__.py
│   │       ├── __main__.py                  # CLI entry point
│   │       ├── main.py                      # app = create_app(load_config())
│   │       └── proxy/
│   │           ├── __init__.py
│   │           ├── proxy_server.py          # create_app, lifespan, router/middleware ordering
│   │           ├── proxy_config.py          # Immutable destination and policy configuration
│   │           ├── _types.py                # ProxyChatCompletionRequest, ModelResponse*, Usage
│   │           ├── common_request_processing.py # ProxyBaseLLMRequestProcessing, create_response
│   │           ├── constants.py
│   │           ├── errors.py                # OpenAI-compatible ProxyException mapping
│   │           ├── endpoints/
│   │           │   ├── __init__.py
│   │           │   ├── chat_completions.py  # chat_completion
│   │           │   ├── models.py            # model_list; one ModelInfoResponse
│   │           │   ├── health.py            # health_liveness, health_readiness
│   │           │   ├── metrics.py            # public custom-registry ASGI mount
│   │           │   └── docs.py               # mount_swagger_ui
│   │           ├── auth/
│   │           │   ├── __init__.py
│   │           │   ├── network.py            # NetworkContext, TrustedProxyConfig
│   │           │   └── anonymous_identity.py # HMAC client_id; no UserAPIKeyAuth
│   │           ├── middleware/
│   │           │   ├── __init__.py
│   │           │   ├── request_context_middleware.py
│   │           │   ├── request_size_limit_middleware.py
│   │           │   ├── security_headers_middleware.py
│   │           │   └── in_flight_requests_middleware.py
│   │           ├── enforcement/
│   │           │   ├── __init__.py
│   │           │   ├── _types.py             # AdmissionDecision, UsageReservation, RateLimitType
│   │           │   ├── usage_policy.py
│   │           │   ├── reservation_limits.py
│   │           │   ├── parallel_request_limiter.py
│   │           │   ├── usage_reservation.py
│   │           │   ├── redis_keys.py
│   │           │   ├── redis_scripts.py
│   │           │   ├── redis_store.py        # authoritative state; never called a cache
│   │           │   ├── bootstrap.py
│   │           │   └── scripts/
│   │           │       ├── admit.lua
│   │           │       └── reconcile.lua
│   │           ├── providers/
│   │           │   ├── __init__.py
│   │           │   └── openai_compatible.py  # URL/header build, JSON and SSE transport
│   │           ├── observability/
│   │           │   ├── __init__.py
│   │           │   ├── context.py
│   │           │   ├── events.py
│   │           │   ├── logging.py            # ProxyLogging + stdlib schema allowlist
│   │           │   ├── log_queue.py
│   │           │   └── prometheus.py         # PrometheusLogger + private registry
│   │           └── static/
│   │               └── swagger/
│   │                   ├── README.md          # Asset pin/update procedure
│   │                   ├── favicon.png        # Pinned local icon; no external fetch
│   │                   ├── swagger-ui.css
│   │                   └── swagger-ui-bundle.js
│   └── tests/
│       ├── conftest.py
│       ├── fixtures/
│       │   ├── mock_openai_server.py
│       │   ├── sse_payloads.py
│       │   └── sensitive_canaries.py
│       ├── contract/
│       │   ├── test_routes_chat_completions.py
│       │   ├── test_routes_models.py
│       │   ├── test_openapi_schema.py
│       │   ├── test_swagger_assets.py
│       │   ├── test_error_contract.py
│       │   ├── test_streaming_contract.py
│       │   ├── test_security_headers_contract.py
│       │   ├── test_metrics_contract.py
│       │   ├── test_logging_contract.py
│       │   ├── test_security_parity_contract.py
│       │   └── test_public_route_inventory.py
│       ├── unit/
│       │   ├── proxy/
│       │   │   ├── test_proxy_config.py
│       │   │   ├── test_proxy_types.py
│       │   │   ├── test_common_request_processing.py
│       │   │   └── test_model_list.py
│       │   ├── auth/
│       │   │   ├── test_network.py
│       │   │   └── test_anonymous_identity.py
│       │   ├── middleware/
│       │   │   ├── test_request_context_middleware.py
│       │   │   ├── test_request_size_limit_middleware.py
│       │   │   ├── test_security_headers_middleware.py
│       │   │   └── test_in_flight_requests_middleware.py
│       │   ├── enforcement/
│       │   │   ├── test_usage_policy.py
│       │   │   ├── test_reservation_limits.py
│       │   │   ├── test_redis_keys.py
│       │   │   └── test_usage_reservation.py
│       │   └── observability/
│       │       ├── test_prometheus.py
│       │       ├── test_logging_redaction.py
│       │       └── test_log_queue.py
│       ├── integration/
│       │   ├── test_openai_client_compatibility.py
│       │   ├── test_streaming_and_disconnect.py
│       │   ├── test_stream_observability.py
│       │   ├── test_rate_limiter_toctou.py
│       │   ├── test_multi_instance_atomicity.py
│       │   ├── test_reservation_reconciliation.py
│       │   ├── test_readiness_failure_modes.py
│       │   └── test_observability_failure_isolation.py
│       ├── security/
│       │   ├── test_destination_lock.py
│       │   ├── test_header_spoofing.py
│       │   ├── test_trusted_proxy.py
│       │   ├── test_public_surface_sanitization.py
│       │   └── test_removed_routes_and_artifacts.py
│       ├── parity/
│       │   ├── test_chat_compatibility_cases.py
│       │   └── test_gateway_security_controls.py
│       └── performance/
│           ├── test_atomic_limit_boundaries.py
│           └── test_monitoring_overhead.py
├── specs/003-simplify-gateway-operations/   # Feature design artifacts
└── .specify/                                # Spec-kit workflow support
```

**Structure Decision**: Use one independently packaged ASGI service under `ai-gw/`, with a compact `ai_gateway.proxy` namespace. HTTP handlers, request processing, enforcement, fixed-provider transport, security middleware, and observability have explicit owners. A local security-control map records every required control and exclusion. There is no generic router, cache abstraction, plugin system, database repository, frontend project, or imported gateway runtime.

## Design and Implementation Strategy

### 1. Immutable startup configuration

Define one strict `ProxyConfig` graph loaded from scalar `AI_GATEWAY_*` environment variables. Its single destination includes public `model_name` plus protected `model`, `api_base`, and `api_key` values. It also includes timeout/pool settings, Redis URL, a base64url 32-byte HMAC secret, validated deployment/epoch identifiers, per-client and global policies, a provider-verified maximum input-token bound, body/header/message/output/stream and upstream-response limits, trusted proxy CIDRs, CORS/HSTS settings, and narrow local-development exceptions. Reject unknown list-shaped routing input, placeholder secrets, multiple destinations, URL userinfo/query/fragment, unsafe schemes/addresses, invalid proxy boundaries, contradictory or overflowing limits, and missing values before creating application resources. Canonically fingerprint every enforcement-relevant value so replicas cannot share counters with different semantics.

Settings are frozen after startup. Editing the environment or secret source has no effect until process restart. One lifespan function creates exactly one HTTPX `AsyncClient`, one async Redis client, preloads the fixed Lua scripts, initializes the custom metrics registry and bounded logger, verifies Redis, and marks readiness. Shutdown first marks the process unready, stops accepting new work, then closes streams/clients and the log writer within bounded deadlines.

### 2. Minimal public interface

Create only these application routes:

- `POST /v1/chat/completions`
- `GET /v1/models`
- `GET /health/liveness`
- `GET /health/readiness`
- `GET /metrics`
- `GET /docs`, `GET /openapi.json`, and Swagger's required local static assets

Disable ReDoc, default root/home responses, route enumeration, and the Swagger OAuth redirect. Unknown, alternate, encoded, provider-prefixed, and legacy gateway paths return a normalized 404. Generate OpenAPI from the same role-discriminated Pydantic schemas used at runtime, inject only the safe public alias and documented effective anonymous limits, and contract-test the normalized document against `contracts/openapi.yaml`. Self-host version-pinned, integrity-recorded Swagger assets and favicon so loading documentation makes no third-party request.

The `model_list` handler constructs a fresh OpenAI-compatible `object: "list"` response from immutable startup configuration. Its `data` array always contains exactly one `ModelInfoResponse` with `id` set to `ProxyConfig.model_name`, `object: "model"`, deterministic `created: 0`, and `owned_by: "ai-gateway"`. It performs no Redis or upstream call, exposes no protected destination value, and has no detail, mutation, pagination, or dynamic discovery companion endpoint.

### 3. Fixed chat request pipeline

Wrap the application, from outermost to innermost, with security headers, request context/outcome finalization, request framing/body limits, CORS, and route handling; keep chat in-progress accounting inside the context finalizer for the full ASGI stream. This ordering gives generated request IDs, safe headers, metrics, and canonical outcomes to middleware-level 413/415/validation failures and unhandled errors. Use pure ASGI middleware and avoid `BaseHTTPMiddleware` around streams. The `chat_completion` route requires uncompressed JSON, validates the frozen role-discriminated chat contract and cross-field rules, rejects extra provider-routing fields, remote media URLs, and upstream file IDs, checks the caller model against the configured public alias, and rewrites only the outbound model to the protected upstream identifier. Caller `user` remains payload and never becomes enforcement identity.

`ProxyBaseLLMRequestProcessing` owns this fixed orchestration sequence and has no routing/plugin branches. `create_response` returns either a validated `ModelResponse` or a `ModelResponseStream` lifecycle. These familiar reference names are intentionally retained while their implementations remain small and feature-specific.

Forward zero caller headers. Construct only the operator-held bearer authorization, fixed URL, content type, accept type, `Accept-Encoding: identity`, and gateway user agent; disable environment proxy inheritance and redirects; verify hostname/TLS; validate all resolved addresses; and require production egress policy to deny non-public and metadata destinations on every connection. Apply explicit connect/read/write/pool, upstream header/body/event/buffer/count, and maximum-stream-lifetime bounds. Relay no arbitrary upstream headers. Make one upstream attempt—no retries, fallback, redirects, or alternate destination.

For non-streaming responses, bound decoded response bytes, validate and normalize the success/error shape, reconcile trustworthy usage once, replace the exposed model with the public name, and return `x-request-id`. For streaming, inspect the upstream status and first valid event before committing `200`, then use HTTPX manual streaming plus a `StreamingResponse` generator that parses complete bounded SSE events without buffering the whole stream, preserves event order, replaces upstream model identifiers with the public alias, extracts final trustworthy usage, and guarantees upstream close plus enforcement finalization in `finally`. A failure before commitment becomes normalized JSON. A failure after commitment emits one sanitized SSE error event and one `[DONE]` when the connection remains writable; a client disconnect writes neither. Duplicate terminators collapse to one, premature EOF is malformed, and comments, CRLF, fragmented events, usage-only chunks, and error events follow `contracts/errors-and-streaming.md`. Streaming responses use `text/event-stream`, `Cache-Control: no-cache, no-store`, and `X-Accel-Buffering: no`.

### 4. Anonymous identity and atomic enforcement

Canonicalize the effective IP from the direct peer and only one bounded, well-formed `X-Forwarded-For` chain received from an explicitly trusted direct peer. Ignore every other forwarded or vendor header, reject ambiguous chains, normalize IPv4-mapped IPv6, and require a peer address for chat. Derive `client_id = base64url_no_pad(HMAC-SHA256(identity_secret, domain_separator + family_byte + packed_ip))`; never persist or log the raw address or chain. Ignore caller `Authorization`, `user`, quota headers, request IDs, and untrusted forwarding headers for identity.

Use two short, fixed Redis Lua scripts invoked through `SCRIPT LOAD`/`EVALSHA` with idempotent reload-on-`NOSCRIPT`. The admission script uses Redis server time, verifies a pre-provisioned marker containing contract, identity, and canonical policy fingerprints, atomically prunes expired concurrency members, evaluates all per-client and global RPM/TPM/concurrency/quota boundaries, creates an opaque reservation distinct from the caller request ID, and increments only required counters. It returns one bounded decision code plus retry time. Every marker and operational key uses the validated `{deployment_id:enforcement_epoch}` hash tag and TTL. New epochs coexist with old expiring state; enforcement changes require a coordinated cutover so callers cannot consume both epochs. Deployment targets one authenticated primary Redis endpoint with `noeviction` and strict AOF durability, not replica reads or an automatic local fallback.

Reserve the operator-verified maximum input tokens plus `n × effective_max_output_tokens` before the upstream call; do not use a model-specific tokenizer as a security boundary. The reconciliation script is idempotent by opaque reservation ID: trustworthy provider usage replaces the reserved amount, while every failure, cancellation, timeout, malformed response, or missing-usage outcome retains the conservative charge. If actual usage exceeds the reservation, charge the delta to the original windows, latch state inconsistent, and fail closed until a corrected new epoch is activated. Concurrency uses expiring sorted-set reservations so abandoned requests cannot hold a slot forever. Reservation and window keys expire no later than their policy window plus request/reconciliation grace. Admission ambiguity never dispatches; reconciliation ambiguity retries the same ID and otherwise retains the reservation. Redis unavailability, marker/script mismatch, or inconsistent data produces a retryable fail-closed error and readiness `503`.

### 5. External-first observability

`PrometheusLogger` registers explicit metrics in a dedicated `CollectorRegistry`; it is a local metrics owner rather than a callback integration. Do not expose default Python/process collectors or arbitrary framework path/status values. Use the stable contract in `contracts/metrics.md`: normalized route, outcome/status class, limit scope/type, failure category, and token direction are closed enumerations. Request IDs, clients, errors, URLs, models, prompts, and costs never become labels. Counters are process-local and restart from zero; each single-worker replica is scraped separately.

`ProxyLogging` constructs one canonical JSON Lines outcome event per request plus bounded lifecycle/service events through standard-library context variables and a schema-first formatter. It is not a callback/plugin manager. Clear and bind context at request start; accept only allowlisted fields and enums; truncate and encode attacker-controlled strings; render UTC timestamps; disable Uvicorn access logs; and route framework, client, and dependency failures through constant redacted categories. Never serialize bodies, raw headers, raw IPs, secrets, stack traces, or raw upstream errors. Write to stdout through a bounded non-blocking queue. Queue saturation increments a metric and produces at most one rate-limited constant stderr notice, so collector loss cannot block chat or create recursive logging. Exactly-once correlation is guaranteed while the local pipeline is healthy; degraded loss is explicitly measurable.

No trace SDK, span propagation/export, remote metrics push, log network sink, dashboard, analytics table, durable log spool, or completed-request record is present. Liveness is constant and dependency-free. Each readiness request performs a bounded authenticated-primary marker and script check; recovery requires that complete check rather than a ping. Detailed dependency failure categories appear only in content-free logs; public health responses remain `{"status":"alive"}` or `{"status":"ready"}`/`{"status":"not_ready"}`.

### 6. Verification and parity

Derive compatibility cases from the frozen OpenAPI chat contract, then add fixed-route, header, error, stream, tool, structured-output, and usage cases. Maintain a standalone security-control matrix linking request parsing, trusted ingress, headers, health, logging, errors, and route controls to an `ai-gw` test or an exclusion justified by removed functionality.

Gate release on:

- OpenAPI contract and OpenAI SDK compatibility for non-streaming, streaming, tools, tool results, and structured output.
- OpenAI client/frontend compatibility for model listing, including an exact one-entry response and zero upstream calls.
- Atomic boundary tests using two gateway instances and real Redis, including restart, stale reservation, window reset, and idempotent reconciliation.
- Route/static-asset inventory proving that only the declared surface exists.
- Security-control-map coverage proving each required control has a local test and every excluded subsystem remains absent.
- Sanitization scans over Swagger/OpenAPI, metrics, health, errors, and logs.
- Security-control contract coverage including every documented deviation and compensation.
- Fault injection for Redis, upstream TLS/DNS/connect/read failures, malformed SSE, disconnects, stdout/log-queue pressure, and collector absence.
- The 10,000-decision concurrency target, 1,000-request request-ID correlation sample, 24-hour expiry test, 250 ms p95 overhead target, and 5% monitoring-overhead target from the specifications.

## Requirement Coverage

| Requirement area | Design owner | Contract/verification evidence |
|---|---|---|
| Single provider/model (`003` FR-001–FR-008) | Frozen settings, fixed destination, static one-entry model projection, exact chat model validation, one HTTPX attempt | `contracts/configuration.md`, OpenAPI model/chat schemas, startup and route tests |
| Swagger-only interface (`003` FR-009–FR-015) | FastAPI OpenAPI plus self-hosted Swagger assets; ReDoc/root/UI absent | `contracts/openapi.yaml`, route/static-asset inventory in `quickstart.md` |
| Prometheus (`003` FR-016–FR-023) | Explicit custom registry and exact-once ASGI finalizer | `contracts/metrics.md`, public sanitization and restart tests |
| Structured logs (`003` FR-024–FR-030) | Context-bound allowlist events through bounded stdout queue | `contracts/logging.md`, canary/redaction/backpressure tests |
| No stored statistics (`003` FR-031–FR-036) | Redis enforcement namespace with TTL; no database/history endpoints | `data-model.md` retention matrix and Redis key inspection |
| Chat compatibility (`002` FR-001–FR-010) | Typed `/v1/chat/completions`, JSON/SSE normalization, fixed route | `contracts/openapi.yaml`, OpenAI client and reference parity tests |
| Anonymous enforcement (`002` FR-011–FR-024) | HMAC client identity plus atomic admission/reconciliation scripts | `data-model.md`, real-Redis two-instance concurrency tests |
| Security/privacy (`002` FR-025–FR-039) | Fixed outbound URL/header allowlist, limits, TLS, security headers, redaction | `contracts/security-parity.md`, `contracts/errors-and-streaming.md`, and focused security suite |
| Operations (`002` FR-040–FR-046) | Startup settings, public sanitized status, metrics/log contracts, bootstrap | Configuration, logging, metrics, error/streaming contracts plus `quickstart.md` |

## Complexity Tracking

No constitution violation requires justification. Redis is retained because the inherited specification requires atomic limits across concurrent requests, replicas, and process restarts; replacing it with process memory would violate those acceptance criteria. A production egress policy is retained because standard HTTP DNS resolution cannot by itself guarantee rebinding-safe destination isolation. All other durable database, UI, logging-spool, routing, and analytics subsystems are removed.
