# Feature Specification: Liara Q&A Gateway

**Feature Branch**: `not created (no branch hook configured)`

**Created**: 2026-08-20

**Last Consolidated**: 2026-08-21

**Status**: Draft

**Input**: User description: "Provide a lightweight OpenAI-compatible gateway for grounded Liara documentation Q&A. The gateway serves anonymous callers through one configurable provider and model, enforces quotas and rate limits, exposes one static model entry for frontend compatibility, offers Swagger as its only browser interface, and uses Prometheus-compatible metrics plus structured logs instead of a UI or stored statistics."

## Clarifications

### Session 2026-08-20

- Public metrics and health endpoints require no authentication but expose only sanitized aggregate data.
- Provider or model configuration changes take effect only after a gateway restart.
- Swagger is publicly accessible without authentication and contains only sanitized examples and schemas.
- Public metrics include aggregate input-token and output-token counters without caller or request labels.
- Distributed tracing is excluded from the first release.
- `GET /v1/models` returns exactly one static entry for the configured public model alias.

### Consolidation 2026-08-21

- This document supersedes features 001 and 002 and incorporates their still-applicable product, enforcement, security, and Liara Q&A requirements.
- Where earlier requirements conflict, the newest decisions apply: callers are anonymous, the gateway owns its request path, only one destination is configured, Swagger is the only browser interface, and completed-request statistics are not stored by the gateway.
- The gateway does not store conversations and does not expose a message-history or message-list endpoint. Frontends own conversation history and send the relevant messages with each chat-completion request.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Ask Grounded Liara Questions Anonymously (Priority: P1)

As an anonymous user, I can ask a question through an OpenAI-compatible chat interface and receive an answer grounded in the indexed Liara documentation without creating an account or obtaining a gateway key.

**Why this priority**: Grounded public Q&A is the primary user outcome and the minimum independently valuable release.

**Independent Test**: Load a known Liara document, submit answerable and unanswerable questions through the public chat endpoint without credentials, and verify that answers use the indexed material and unsupported questions do not invent an answer.

**Acceptance Scenarios**:

1. **Given** the gateway and retrieval service are ready and Liara documents are indexed, **When** an anonymous caller asks a covered question using the configured public model alias, **Then** the caller receives a compatible answer supported by the indexed documentation.
2. **Given** the indexed documents do not support an answer, **When** an anonymous caller asks an unsupported question, **Then** the response states that the available documentation is insufficient rather than fabricating an answer.
3. **Given** a valid streaming request, **When** the upstream begins responding, **Then** the caller receives ordered compatible stream events followed by one normal completion marker.
4. **Given** the retrieval service is unavailable or returns an invalid response, **When** a caller submits a question, **Then** the caller receives a sanitized, actionable upstream error and no unrelated internal service is exposed.
5. **Given** a supported tool, tool-result, or structured-output field, **When** the request is forwarded, **Then** the gateway preserves its compatible semantics without executing tools itself.

---

### User Story 2 - Enforce Anonymous Usage Limits (Priority: P1)

As the operator, I can protect the shared model allowance with per-anonymous-client and gateway-wide request, token, concurrency, and quota limits that remain correct across concurrent requests and multiple gateway instances.

**Why this priority**: Anonymous public access is unsafe without reliable abuse and cost controls.

**Independent Test**: Apply small limits, exercise boundaries from two anonymous client identities across two gateway instances, and verify isolation, atomic admission, reset, reservation, reconciliation, and fail-closed behavior.

**Acceptance Scenarios**:

1. **Given** two anonymous client identities, **When** one reaches a configured limit, **Then** that identity is rejected while the other remains unaffected if it has allowance.
2. **Given** sufficient allowance, **When** a request is admitted, **Then** conservative usage is reserved before the upstream call and reconciled exactly once after completion.
3. **Given** simultaneous requests that cross a per-client or gateway-wide boundary, **When** admission decisions occur, **Then** only requests within the allowance reach the upstream service.
4. **Given** an exhausted short window or quota, **When** the caller retries, **Then** the gateway returns a compatible limit error with a safe retry indication and makes no upstream request.
5. **Given** the documented window has reset, **When** a request arrives, **Then** it is evaluated against the new window without completed usage leaking from the expired window.
6. **Given** authoritative enforcement state is unavailable or inconsistent, **When** admission is required, **Then** the gateway rejects the request with a retryable error rather than forwarding unaccounted usage.

---

### User Story 3 - Use Existing OpenAI-Compatible Frontends (Priority: P1)

As a frontend developer, I can point an OpenAI-compatible client at the gateway, discover its one public model, and perform chat completions without a gateway-specific adapter.

**Why this priority**: Compatibility lets the Q&A service work with standard frontends while keeping the gateway surface small.

**Independent Test**: Configure a standard OpenAI-compatible client with the gateway base URL, call model discovery, then complete non-streaming and streaming chats using the returned model identifier.

**Acceptance Scenarios**:

1. **Given** a running gateway, **When** a client calls `GET /v1/models`, **Then** it receives a compatible list containing exactly one static public model entry and no protected upstream metadata.
2. **Given** the returned public model identifier, **When** a client calls `POST /v1/chat/completions`, **Then** it can process the success or error without a gateway-specific client library.
3. **Given** a model value that does not exactly match the configured public alias, **When** a request is validated, **Then** it is rejected before any upstream connection occurs.
4. **Given** a frontend conversation, **When** it sends a new turn, **Then** it includes the relevant prior messages in that chat request because the gateway exposes no history endpoint.

---

### User Story 4 - Configure One Fixed Destination (Priority: P2)

As the operator, I can configure exactly one OpenAI-compatible provider endpoint, upstream model, protected credential, and public model alias so routing remains predictable and cannot be changed by callers.

**Why this priority**: A single immutable destination reduces configuration ambiguity and prevents caller-controlled routing.

**Independent Test**: Start with one valid destination, inspect readiness and model discovery, then attempt missing, unsafe, placeholder, plural, and caller-overridden configurations and verify they fail before upstream traffic.

**Acceptance Scenarios**:

1. **Given** one valid destination configuration, **When** the gateway starts, **Then** exactly that route becomes active.
2. **Given** missing, unsafe, placeholder, ambiguous, or plural destination configuration, **When** startup is attempted, **Then** startup fails without exposing secrets.
3. **Given** a running gateway and edited destination configuration, **When** requests arrive before restart, **Then** the immutable startup configuration remains active.
4. **Given** caller-controlled headers, fields, paths, or query values, **When** a request is processed, **Then** none can alter the upstream scheme, host, port, path, model, credential, or proxy behavior.

---

### User Story 5 - Operate Through Swagger, Metrics, and Logs (Priority: P2)

As an operator, I can understand the API through Swagger and monitor health, traffic, latency, upstream outcomes, and limit enforcement through Prometheus-compatible metrics and structured logs without a custom UI or gateway-owned analytics history.

**Why this priority**: The service needs a small, auditable operational surface after custom interfaces and stored statistics are removed.

**Independent Test**: Inspect all public routes, exercise success, rejection, cancellation, and upstream-failure outcomes, collect metrics and logs, and verify complete accounting, request correlation, sanitization, and absence of other browser interfaces or historical query endpoints.

**Acceptance Scenarios**:

1. **Given** any user opens Swagger without credentials, **When** the documentation loads, **Then** it describes model discovery, chat, streaming, errors, health, and anonymous limits using sanitized schemas and examples.
2. **Given** representative request outcomes, **When** metrics are collected, **Then** aggregate volume, active work, duration, upstream failures, limit rejections, readiness, and trustworthy token totals are visible using bounded dimensions.
3. **Given** an admitted or rejected request, **When** logs are collected, **Then** its lifecycle correlates to the caller-visible gateway-generated request identifier.
4. **Given** chat content, credentials, raw client addresses, internal errors, and arbitrary caller input, **When** all public output, metrics, and logs are scanned, **Then** none of those protected values appears.
5. **Given** a slow or unavailable external metrics or log collector, **When** valid chat traffic continues, **Then** chat and enforcement behavior remains correct and monitoring degradation is detectable.
6. **Given** a request for a home page, dashboard, administration page, analytics page, usage history, model-management page, or message history, **When** it reaches the gateway, **Then** the gateway returns a normal not-found response.

---

### User Story 6 - Load and Validate Liara Documentation (Priority: P3)

As the operator, I can load the existing Liara documentation into the retrieval service using its supported facilities, inspect parsing status, and validate the complete gateway-to-retrieval-to-model flow without a custom ingestion program.

**Why this priority**: The content workflow is required for grounded answers but remains operational setup rather than gateway-owned ingestion logic.

**Independent Test**: Import the documents under `liara-docs/public/llms`, inspect success and failure status, bind the collection to the configured assistant, and run a documented end-to-end question.

**Acceptance Scenarios**:

1. **Given** the Liara document directory, **When** the operator imports it through the retrieval service's supported interface, **Then** every selected document is reported as parsed, processing, or failed.
2. **Given** a parsed collection and configured assistant, **When** the gateway sends a chat request, **Then** the assistant retrieves context from that collection before generating the answer.
3. **Given** an empty, duplicate, unsupported, or failed document, **When** import status is reviewed, **Then** the issue is visible without exposing a secret or requiring a custom ingestion script.

### Edge Cases

- Multiple callers share a public network address and therefore share one anonymous allowance.
- A caller changes addresses, alternates IPv4 and IPv6, or supplies a forged forwarding chain, authorization value, request identifier, model, or quota-related header.
- A request lands exactly on a request, token, concurrency, quota, body-size, nesting, message-count, output, timeout, or streaming-lifetime boundary.
- Multiple gateway instances admit requests for one anonymous identity simultaneously.
- A stream is cancelled, interrupted, malformed, oversized, or ends without trustworthy usage.
- Actual upstream usage exceeds the conservative reservation or reconciliation is repeated after an uncertain response.
- Enforcement state fails during startup, admission, completion, reconciliation, or window reset.
- The configured public alias differs from the upstream model identifier, or a caller supplies a near-match with different case.
- The provider returns extra compatible fields, an unfamiliar error, an oversized body, invalid event framing, or protected data in an error body.
- Destination DNS changes after startup or resolves to a prohibited network target.
- Metrics are scraped while requests complete, counters reset after restart, or a caller attempts to create high-cardinality labels.
- The external log sink blocks, its queue fills, or logging itself fails.
- A document is empty, duplicated, unsupported, stale, or fails parsing; the retrieval service is unavailable or not bound to the correct collection.
- A browser requests a removed UI route, stale asset, alternate path encoding, unsupported method, or excluded API.

## Requirements *(mandatory)*

### Functional Requirements

#### Grounded Liara Q&A

- **FR-001**: The solution MUST provide anonymous Q&A over the Liara documentation through the gateway's OpenAI-compatible chat surface.
- **FR-002**: The retrieval service MUST use a dedicated knowledge collection populated from `liara-docs/public/llms` before generating grounded answers.
- **FR-003**: Operators MUST be able to import and inspect document parsing status through the retrieval service's supported facilities without a gateway-owned ingestion program.
- **FR-004**: Responses MUST indicate insufficient supporting documentation when the collection cannot support an answer rather than presenting unsupported information as grounded fact.
- **FR-005**: The retrieval assistant MUST use the operator-configured OpenAI-compatible model service with credentials supplied outside version control.
- **FR-006**: All public end-user Q&A traffic MUST enter through the gateway; direct public access to the retrieval assistant MUST be unavailable so enforcement cannot be bypassed.
- **FR-007**: Deployment guidance MUST cover service readiness, private connectivity, non-secret configuration names, document import, collection/assistant binding, and end-to-end validation.

#### OpenAI-Compatible Chat and Fixed Destination

- **FR-008**: The public inference surface MUST provide `POST /v1/chat/completions` with compatible non-streaming and streaming successes and errors.
- **FR-009**: Anonymous chat MUST require no gateway account, API key, login, user, team, group, organization, role, or membership.
- **FR-010**: The retained chat contract MUST support documented message roles, text and allowed multimodal content, generation controls, stop conditions, tool definitions/calls/results, structured-output controls, streaming controls, and usage reporting; unsupported fields MUST be rejected clearly.
- **FR-011**: The gateway MUST return payloads that standard OpenAI-compatible clients can process without a gateway-specific adapter.
- **FR-012**: Exactly one provider endpoint, upstream model identifier, protected credential, and public model alias MUST be configurable per running gateway.
- **FR-013**: Every accepted chat request MUST route to that fixed destination; callers MUST NOT be able to change destination or credential behavior.
- **FR-014**: The caller's model field MUST exactly match the public alias, and mismatches MUST be rejected before any upstream connection.
- **FR-015**: Startup MUST fail closed for missing, placeholder, unsafe, contradictory, or plural destination configuration.
- **FR-016**: `GET /v1/models` MUST return exactly one static compatible model entry derived from immutable startup configuration without querying the upstream or exposing protected metadata.
- **FR-017**: Destination changes MUST require configuration update and restart; dynamic discovery, runtime model management, fallback, load balancing, and multi-destination routing MUST be absent.
- **FR-018**: The gateway MUST NOT provide responses, assistants, embeddings, image, audio, video, file, batch, fine-tuning, rerank, vector-store, realtime, generic passthrough, or agent endpoints in the first release.
- **FR-019**: The gateway MUST NOT store conversations or expose endpoints for messages, conversation history, prompt history, or response history; callers send relevant prior messages in each request.

#### Anonymous Identity and Enforcement

- **FR-020**: Every chat request MUST receive a deployment-scoped pseudonymous client identity derived from the effective network address established by the direct connection and explicitly trusted ingress proxies.
- **FR-021**: Caller-supplied identity, user, authorization, request-ID, forwarding, and quota-related values MUST NOT determine enforcement identity or policy.
- **FR-022**: Raw client network addresses MUST NOT be retained when the pseudonymous identity is sufficient.
- **FR-023**: Operators MUST be able to configure default per-client and gateway-wide policies without user or organization records.
- **FR-024**: Both policy scopes MUST support requests per minute, tokens per minute, maximum concurrent requests, and a resettable total-token quota.
- **FR-025**: Every applicable check MUST complete atomically before upstream traffic under concurrent requests and multiple gateway instances.
- **FR-026**: Admission MUST reserve conservative maximum usage, prevent oversubscription, and reconcile trustworthy actual usage exactly once.
- **FR-027**: Cancellation, timeout, malformed streams, missing usage, and uncertain completion MUST be reconciled conservatively without granting duplicate or unaccounted allowance.
- **FR-028**: Authoritative enforcement state MUST survive normal gateway restarts and expire only according to the documented enforcement windows and reconciliation lifecycle.
- **FR-029**: If enforcement state is unavailable, inconsistent, or under-reserved, new requests MUST fail closed with a retryable compatible error until correct decisions can resume.
- **FR-030**: Limit errors MUST distinguish short-window throttling from exhausted quota, safely indicate when retry may succeed, and disclose no other caller's state.
- **FR-031**: Policy changes and resets MUST have deterministic documented behavior across replicas and in-flight reservations.

#### Security and Privacy

- **FR-032**: Public traffic MUST use encrypted transport in supported deployments, upstream identity MUST be verified, and insecure upstream transport MUST be limited to an explicit local-development exception.
- **FR-033**: Provider, operator, pseudonymization, and enforcement credentials MUST remain outside version-controlled artifacts and MUST never be returned to callers, documentation, metrics, or logs.
- **FR-034**: Startup MUST fail closed for missing secrets, placeholder secrets, ambiguous trusted-proxy boundaries, or destinations that violate outbound policy.
- **FR-035**: Requests MUST have explicit limits for headers, body size, framing, content encoding/type, nesting, message count, declared output, duration, concurrent work, upstream response size, and streaming lifetime.
- **FR-036**: Paths, methods, model identifiers, and payloads MUST be validated before upstream contact, with malformed or unsupported input rejected safely.
- **FR-037**: No caller header may be forwarded upstream; the gateway MUST construct only the required authentication, content, and gateway-generated request metadata.
- **FR-038**: Callers MUST NOT influence the upstream scheme, host, port, path, DNS target, proxy, credential, or model through any field, header, query, or encoded path.
- **FR-039**: Outbound policy MUST reject prohibited destination addresses and remain effective if DNS answers change.
- **FR-040**: Errors MUST be normalized without stack traces, filesystem paths, internal addresses, secret fragments, arbitrary upstream headers, or raw upstream bodies.
- **FR-041**: Responses MUST prevent content sniffing, framing, and shared-cache storage; strict transport MUST be advertised only when authoritative, and browser cross-origin access MUST be denied by default unless explicitly allowlisted.
- **FR-042**: Conversation content, tool arguments/results, and response bodies MUST NOT be persisted or emitted to logs.
- **FR-043**: One upstream completion MUST NOT be charged more or less than once through replayed or repeated reconciliation.
- **FR-044**: The self-hosted gateway MUST emit no external telemetry except operator-configured metrics scraping and log collection.

#### Swagger-Only Public Surface

- **FR-045**: Swagger MUST be the only browser-facing interface and MUST be publicly accessible without authentication.
- **FR-046**: Swagger MUST document model discovery, chat, health, readiness, streaming behavior, compatible errors, the exact public model requirement, and effective anonymous limit behavior.
- **FR-047**: Swagger MUST permit supported non-streaming requests and explain external consumption of streaming responses when its interface cannot render them faithfully.
- **FR-048**: API descriptions and examples MUST contain no credential, internal address, protected configuration, caller data, or live usage value.
- **FR-049**: The gateway MUST NOT serve a home page, custom chat page, administration UI, dashboard, analytics UI, statistics UI, model-management UI, or dedicated assets for those interfaces.
- **FR-050**: Removed and unknown routes MUST return a normalized not-found response without redirecting to another interface.

#### Metrics, Logging, and Data Retention

- **FR-051**: The gateway MUST expose public sanitized liveness, readiness, and Prometheus-compatible metrics endpoints without authentication.
- **FR-052**: Metrics MUST cover request counts by bounded outcome, in-progress work, request and upstream duration distributions, upstream failures, limit rejections, readiness, and aggregate input/output token totals when trustworthy.
- **FR-053**: Metric names, units, meanings, and allowed labels MUST be documented and stable for a published version.
- **FR-054**: Metrics MUST NOT contain request IDs, raw or pseudonymous identities, model/provider details, content, credentials, URLs, arbitrary status/error text, or any unbounded label value.
- **FR-055**: Metrics counters MUST have documented restart semantics, and an unavailable collector MUST NOT affect readiness, chat, or enforcement decisions.
- **FR-056**: The gateway MUST emit machine-parseable structured logs as its primary request diagnostic and MUST NOT emit distributed traces in the first release.
- **FR-057**: Each request lifecycle MUST record a timestamp, severity, stable event name, gateway-generated request ID, canonical operation, validated public model alias when applicable, admission result, bounded outcome/category, status, streaming indicator, duration, and trustworthy token usage when available.
- **FR-058**: The gateway-generated request ID MUST be returned to the caller, override any caller-supplied ID, propagate to the upstream, and correlate exactly one final request outcome.
- **FR-059**: Logs MUST exclude content, tool data, credentials, authorization headers, raw addresses, internal stack traces, raw upstream errors, and invalid caller-supplied model values.
- **FR-060**: Attacker-controlled log values MUST be allowlisted, type-checked, length-bounded, and encoded so they cannot forge fields or records.
- **FR-061**: Log collection MUST be bounded and non-blocking; sink loss or backpressure MUST NOT alter chat admission or quota results, and drops MUST be observable without recursive flooding.
- **FR-062**: The gateway MUST NOT maintain completed-request history, usage analytics, cost reports, or a query/export interface for historical activity.
- **FR-063**: Enforcement state MAY persist only to make current limits correct, MUST expire according to policy, and MUST NOT become an operator-facing statistics store or be joined with conversation content.
- **FR-064**: Long-term retention, dashboards, alerts, metric storage, and log search belong to operator-managed external systems and are not required for correct chat service.

#### Operations

- **FR-065**: Readiness MUST be positive only when immutable configuration is valid and authoritative enforcement decisions can be made; public health responses MUST reveal no dependency names or internal details.
- **FR-066**: Operator documentation MUST cover destination configuration, trusted ingress, anonymous identity/NAT tradeoffs, enforcement and reset behavior, supported chat features, document loading, security boundaries, secret handling, monitoring, and validation.
- **FR-067**: The delivered route inventory MUST contain only chat completions, static model discovery, Swagger/OpenAPI assets, liveness, readiness, and metrics.
- **FR-068**: Removed multi-model, routing, authentication-management, custom-UI, stored-statistics, and tracing capabilities MUST not remain reachable, configurable, or presented as supported.

### Key Entities

- **Gateway Destination**: The sole immutable route containing one fixed provider address, protected credential reference, upstream model identifier, and public model alias.
- **Public Model Entry**: The static, non-sensitive compatible projection of the configured destination returned to clients.
- **Anonymous Client**: A caller represented by a deployment-scoped pseudonymous identifier derived from a trusted effective network address, without an account or gateway key.
- **Usage Policy**: Per-client or gateway-wide request, token, concurrency, and quota allowances with documented window and reset behavior.
- **Usage Reservation**: Allowance held before upstream work and later reconciled or conservatively charged exactly once.
- **Knowledge Collection**: The retrieval-managed collection containing imported Liara documentation.
- **Retrieval Assistant**: The private Q&A destination bound to the Liara collection and the configured model service.
- **Operational Metric**: A process-local aggregate measurement with documented units and bounded dimensions for external collection.
- **Structured Log Event**: A machine-parseable, content-free event with stable fields and request correlation.
- **Enforcement State**: Temporary authoritative control data needed for active limits, distinct from historical analytics.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For at least 30 answerable Liara documentation questions, at least 90% of responses are correct and supported by the indexed collection, and unsupported questions are identified as such.
- **SC-002**: Standard model-discovery, non-streaming, streaming, tool-call, tool-result, structured-output, and compatible-error scenarios work through an OpenAI-compatible client without a gateway-specific adapter.
- **SC-003**: Exactly one destination is active, model discovery returns exactly its public alias, and 100% of second-destination or model-mismatch attempts fail before upstream traffic.
- **SC-004**: Across at least 10,000 mixed concurrent boundary decisions on two gateway instances, 100% of requests beyond any per-client or gateway-wide request, token, concurrency, or quota limit are rejected before upstream traffic, while callers with allowance remain unaffected.
- **SC-005**: After restart, cancellation, and quota-window reset tests, every successful upstream request is accounted for exactly once and uncertain usage is never undercharged.
- **SC-006**: At least 95% of accepted requests begin returning a response within 10 seconds under pilot load, and gateway-added median overhead is no more than 250 milliseconds compared with the same upstream request.
- **SC-007**: The public route inventory contains the required chat, one-model discovery, Swagger/OpenAPI, health, readiness, and metrics routes and zero message-history, custom UI, management, analytics, alternative AI capability, or dynamic-routing routes.
- **SC-008**: Metrics classify 100% of tested request outcomes using documented bounded categories and count 100% of trustworthy provider-reported token usage exactly once.
- **SC-009**: For 100% of a 1,000-request diagnostic sample, the caller-visible request ID maps to exactly one content-free final structured event with the correct outcome.
- **SC-010**: Automated scans of public responses, API descriptions, metrics, and logs find zero credentials, raw addresses, conversation/tool content, internal paths, stack traces, raw upstream errors, or invalid caller model strings.
- **SC-011**: With metrics collection and log ingestion unavailable for 30 minutes, 100% of otherwise valid requests retain correct chat and enforcement outcomes while monitoring degradation remains detectable.
- **SC-012**: A 24-hour representative-load test creates no gateway-owned completed-request, conversation, cost, or analytics history; expired enforcement state is removed within one cleanup interval.
- **SC-013**: An operator unfamiliar with the codebase can configure the destination and anonymous limits, establish the trusted ingress boundary, import the Liara documents, verify readiness, and complete an end-to-end grounded request within 30 minutes after required images are available.

## Assumptions

- Anonymous callers present no gateway credential. Operator-held upstream, retrieval, and enforcement credentials remain private.
- Anonymous clients are distinguished by effective network address: callers behind one NAT share an allowance, while an address change may create a different identity.
- The gateway's one configured destination is the private OpenAI-compatible retrieval assistant used for Liara Q&A; the assistant may call the operator-selected model service internally.
- The operator imports `liara-docs/public/llms` using the retrieval service's supported UI or API; continuous document synchronization is not required.
- The caller's `user` field is untrusted payload and never an enforcement identity.
- The operator selects concrete rate, quota, size, timeout, and reset values; conservative secure defaults apply where appropriate.
- Shared authoritative enforcement state is available for multi-instance operation and retains only data needed for active policies and reconciliation.
- Trustworthy final token usage is used when available; otherwise the documented conservative reservation policy applies.
- Public transport may terminate at a trusted ingress, but traffic outside a trusted host or private deployment network remains encrypted.
- No conversation persistence, response caching, semantic caching, moderation, prompt filtering, or gateway tool execution is required.

## Dependencies

- A reachable private OpenAI-compatible retrieval assistant bound to the Liara knowledge collection.
- A reachable OpenAI-compatible model service and valid operator-held credentials for the retrieval assistant.
- Read access to `liara-docs/public/llms` for operator-driven import.
- Trusted ingress and private service networking that prevent direct public bypass of the gateway.
- Trustworthy time and shared authoritative enforcement state for multi-instance deployment.
- An operator-managed Prometheus-compatible collector and structured-log collector when historical monitoring, alerts, or search are desired.

## Scope Boundaries

### In Scope

- Anonymous grounded Q&A over the indexed Liara documentation.
- One fixed OpenAI-compatible gateway destination and one public model alias.
- Static one-model discovery for standard frontends and SDKs.
- Chat completions with supported streaming, tools, tool results, structured output, usage, and compatible errors.
- Per-anonymous-client and gateway-wide request, token, concurrency, and resettable token-quota enforcement.
- Operator-driven document loading and status inspection through the retrieval service.
- Swagger as the only browser-facing gateway interface.
- Public sanitized liveness, readiness, and Prometheus-compatible metrics.
- Structured, correlated, content-free logs and temporary enforcement state.

### Out of Scope

- Multiple simultaneous providers, models, aliases, routes, fallbacks, or load-balanced destinations.
- Dynamic model discovery, runtime registration, public switching, caller-selected destinations, or provider passthrough.
- Message or conversation storage and any history/list endpoint; frontends retain conversation state.
- AI APIs other than chat completions, including responses, assistants, embeddings, images, audio, video, files, batches, fine-tuning, vector stores, realtime, and gateway-executed agents.
- End-user authentication, keys, accounts, registration, teams, groups, organizations, roles, SSO, billing, or payment.
- A custom chat, home, administration, configuration, analytics, statistics, or monitoring UI.
- Gateway-owned historical request, token, cost, performance, per-client, conversation, or analytics storage.
- Built-in dashboards, alerts, metric retention, log indexing/search, or distributed tracing.
- Automated or continuous document synchronization and unrestricted web search outside the indexed Liara collection.
