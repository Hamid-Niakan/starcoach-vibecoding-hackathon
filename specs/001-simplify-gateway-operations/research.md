# Research: Liara Q&A Gateway

**Date**: 2026-08-21
**Scope**: Resolve the technical choices for the consolidated grounded-Q&A, anonymous-enforcement, single-destination, frontend-compatibility, Swagger, metrics, logging, and security requirements.

## Decision 1: Own a Small Fixed-Purpose Gateway

**Decision**: Implement `ai-gw/` as an independently packaged Python ASGI service with an explicit route inventory.

**Rationale**: A fixed-purpose service makes routes, dependencies, outbound behavior, and retained state auditable. It avoids importing a broader gateway runtime whose routing, management, storage, UI, and plugin features are explicitly out of scope.

**Alternatives rejected**:

- Filter a broad gateway's route table: hidden startup behavior and dependencies would remain.
- Fork a broad gateway and delete features: upgrades would create a large permanent maintenance surface.
- Add a generic provider router: the release supports exactly one immutable destination.

## Decision 2: Use a Minimal Async Web Stack

**Decision**: Use Python 3.12, FastAPI/Uvicorn, Pydantic settings and schemas, HTTPX for the sole upstream, redis-py for enforcement state, prometheus-client with a private registry, and standard-library logging with bounded JSON serialization.

**Rationale**: These components cover strict validation, streaming, pooled HTTP, atomic shared state, generated Swagger/OpenAPI, metrics exposition, and structured logs without adding provider-routing or analytics frameworks.

**Alternatives rejected**:

- Multiple workers in one container: complicates process-local metrics; deploy one worker per replica and scale horizontally.
- A model-specific tokenizer as an admission boundary: it cannot be trusted for arbitrary compatible upstream models.
- A relational usage database: it encourages the historical statistics subsystem that the feature excludes.

## Decision 3: Freeze One Destination at Startup

**Decision**: Load one immutable destination from scalar `AI_GATEWAY_*` settings: public alias, upstream model, API base, and protected API key. Validate it completely before resources are opened; changes require restart.

**Rationale**: Scalar startup configuration makes plural routing impossible, allows a deterministic one-entry model list, and prevents partial runtime changes across in-flight requests.

**Required rejection cases**:

- Missing or placeholder credentials.
- List, mapping, comma-separated, fallback, or multi-destination configuration.
- URL user information, query, fragment, unsafe scheme, or prohibited address.
- Invalid trusted-proxy boundaries, identity secrets, policy values, or inconsistent limits.

## Decision 4: Freeze the Public Compatibility Contract

**Decision**: Treat `contracts/openapi.yaml` as the v1 source of truth. Support `POST /v1/chat/completions`, `GET /v1/models`, health/readiness, metrics, Swagger/OpenAPI, and Swagger's local assets only.

**Rationale**: A strict contract supports standard frontends without accepting arbitrary provider or routing extensions. Extra fields outside the enumerated chat contract fail validation rather than being silently forwarded.

**Streaming boundary**:

- Completion occurs only after the final ASGI body, not when response headers start.
- Upstream resources and reservations close in `finally`.
- Exactly one `[DONE]` marker is emitted for a writable normally terminated stream.
- Pre-commit failures become normalized JSON; post-commit failures become one sanitized stream error when writable.
- Disconnects, truncated streams, malformed events, and missing usage are finalized conservatively.

## Decision 5: Use Atomic Shared Enforcement State

**Decision**: Use Redis server time and two Lua scripts: one atomic admission/reservation transition and one idempotent reconciliation/release transition.

**Rationale**: One server-side transition prevents time-of-check/time-of-use races across replicas. Server time provides a common reset clock. Key expiry bounds state lifetime and prevents active enforcement data from becoming analytics history.

**Key invariants**:

- Client and gateway-wide RPM, TPM, concurrency, and quota are checked together.
- Every key is scoped by deployment and enforcement epoch.
- A marker stores the contract, identity, and canonical policy fingerprints.
- Reservations use opaque IDs unrelated to caller request IDs.
- Redis errors, marker mismatches, script mismatches, and inconsistent state fail closed.
- No process-local enforcement fallback exists.

## Decision 6: Reserve a Provider-Neutral Worst Case

**Decision**: Reserve the operator-verified maximum input bound plus `n × effective maximum output tokens` before dispatch. Reconcile trustworthy actual token usage exactly once; retain the reservation for missing or uncertain usage.

**Rationale**: Character or byte heuristics can undercount, while a provider-specific tokenizer does not generalize safely. A configured verified ceiling produces a simple provider-neutral security boundary.

If actual usage ever exceeds the reservation, charge the delta to the original window, latch the enforcement state inconsistent, and reject new work until a corrected policy epoch is activated.

## Decision 7: Derive Anonymous Identity at a Trusted Network Boundary

**Decision**: Resolve the effective client address from the direct peer and a single bounded forwarding chain only when the direct peer is explicitly trusted. Canonicalize the address and derive a deployment-keyed HMAC pseudonym.

**Rationale**: This supports public anonymous limits without accounts or gateway keys while preventing trivial spoofing through caller headers. Raw addresses are unnecessary after pseudonymization.

**Known tradeoff**: Callers behind one NAT share an allowance; address changes may create a new identity. Stronger device identity and proof-of-personhood remain out of scope.

## Decision 8: Lock Down the Outbound Request

**Decision**: Construct the upstream request from immutable settings and validated chat data. Forward no caller headers. Disable redirects and environment-proxy inheritance, verify TLS, validate all resolved addresses, and permit only one upstream attempt.

**Rationale**: The gateway holds a privileged credential, so caller-controlled headers, URLs, proxies, DNS targets, or redirects would create credential theft and server-side request forgery risks.

Provider responses are bounded by header, decoded-body, stream-event, buffer, event-count, inactivity, and total-lifetime limits. Public errors and headers are constructed locally from fixed allowlists.

## Decision 9: Use a Private Prometheus Registry

**Decision**: Expose an explicit custom `CollectorRegistry` through `/metrics`; do not register default runtime/process collectors. Run one worker per replica and let Prometheus aggregate instances externally.

**Metric families**:

- Requests completed by bounded outcome.
- Chat requests in progress.
- Request and upstream duration histograms.
- Upstream failures by bounded category.
- Limit rejections by scope and type.
- Aggregate input and output token counters.
- Readiness and dropped-log indicators.

**Cardinality rule**: Never label with request ID, caller identity, model/provider, raw route, URL, content, error text, or arbitrary status.

## Decision 10: Finalize Observability at the ASGI Boundary

**Decision**: Use pure ASGI middleware to generate the authoritative request ID, bind request-local context, inject the response header, observe response completion/disconnect, and finalize metrics/logs exactly once.

**Rationale**: Endpoint return time is not stream completion time. Pure ASGI wrapping can observe the final response body and avoids context-variable limitations in convenience middleware.

The gateway ignores inbound request IDs, forwards only its generated ID, and never starts a competing receive consumer.

## Decision 11: Use Allowlists and a Non-Blocking Log Queue

**Decision**: Serialize one canonical content-free JSON completion event per request plus sparse lifecycle events. Apply a typed top-level field allowlist before rendering. Write through a fixed-capacity non-blocking queue to stdout/stderr.

**Rationale**: An allowlist is safer than recursively attempting to redact arbitrary objects. A bounded non-blocking queue prevents log collection pressure from becoming chat-path backpressure or unbounded memory usage.

Queue-full and sink-error drops increment a metric and may emit only a rate-limited constant emergency line with no request data.

## Decision 12: Serve Swagger Only

**Decision**: Serve public self-hosted Swagger at `/docs`, OpenAPI at `/openapi.json`, and no ReDoc, root page, custom chat, administration, analytics, statistics, or model-management interface.

**Rationale**: Swagger provides API discovery and non-streaming request testing without introducing a separate frontend. Local pinned assets prevent documentation views from contacting a third-party CDN.

The schema exposes only the public alias and static sanitized examples. Streaming usage is documented for external clients rather than overstating the browser UI's rendering behavior.

## Decision 13: Keep Conversation History in the Frontend

**Decision**: The gateway exposes no message-list or conversation-history endpoint and persists no prompt or response. A frontend retains its own conversation state and sends relevant prior messages in each chat-completion request.

**Rationale**: This matches the stateless chat-completion contract and the requirement to eliminate stored statistics and conversation history from the gateway.

## Decision 14: Integrate Grounded Q&A Through the Fixed Destination

**Decision**: Configure the gateway's sole upstream as the private OpenAI-compatible RAGFlow assistant bound to a dedicated Liara knowledge collection. RAGFlow uses the operator-configured GAP GPT service internally.

**Rationale**: The gateway remains provider-neutral and single-destination while the retrieval system owns document parsing, indexing, citations, and grounding. Existing documents under `liara-docs/public/llms` are imported through RAGFlow's supported UI or API, so the gateway needs no ingestion subsystem.

Direct public access to the assistant is denied by network policy, ensuring anonymous limits cannot be bypassed.

## Decision 15: Minimal Public Health and External Retention

**Decision**: Liveness is a constant local response. Readiness performs a bounded authenticated-primary enforcement marker/script check and reveals only ready/not-ready. Metrics and health are public but sanitized and bounded.

**Rationale**: Readiness must prove correct admission decisions, not merely process existence. Detailed dependencies, addresses, model names, policy values, and error strings are unnecessary on the public surface.

Long-term metric storage, dashboards, alerts, log indexing, and retention belong to operator-managed systems. The gateway stores only expiring enforcement state.

## Decision 16: Verify Contracts and Failure Boundaries

**Decision**: Gate release on OpenAPI and standard-client compatibility, one-model discovery, real-Redis two-instance atomicity, idempotent reconciliation, stream disconnects, destination/header attacks, public-surface sanitization, route inventory, logging pressure, collector absence, and representative load tests.

**Rationale**: The highest risks are race conditions, leaked routes or secrets, partial-stream finalization, caller-controlled routing, and observability failures. Versioned contracts and black-box tests make those boundaries reviewable without relying on a broad external gateway implementation.
