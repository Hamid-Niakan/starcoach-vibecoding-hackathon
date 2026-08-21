# Feature Specification: Integrate AI Gateway

**Feature Branch**: `codex/ai-gateway-integration`

**Created**: 2026-08-21

**Status**: Draft

**Input**: Merge `codex/monorepo-foundation` and `feat/ai-gateway-backend` without modifying either source branch; make the imported AI gateway the authoritative backend, expose an OpenAI-compatible interface, connect Liara Docs end to end, and defer ZarinPal connectivity.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Chat from Liara Docs (Priority: P1)

As a Liara documentation visitor, I can ask a question from the existing assistant UI and receive an incrementally rendered response from the integrated gateway without knowing which upstream model serves it.

**Why this priority**: A working Liara conversation is the first user-visible proof that the merged repository delivers one coherent product rather than two adjacent codebases.

**Independent Test**: Start the supported local stack, open the Liara chat page, send a Persian or English question, observe multiple response increments, cancel one response, and send a follow-up that includes the visible conversation context.

**Acceptance Scenarios**:

1. **Given** the gateway is ready and exposes one public model, **When** a visitor opens Liara chat and sends a valid question, **Then** the UI uses the advertised model and renders the response incrementally until completion.
2. **Given** a completed exchange, **When** the visitor asks a follow-up, **Then** the request includes the conversation messages required for the response to reflect the visible context.
3. **Given** a response is streaming, **When** the visitor cancels it, **Then** the upstream request is terminated and the UI remains usable for another request.
4. **Given** the gateway rejects or cannot complete a request, **When** Liara receives the bounded error, **Then** the UI shows a Persian, recoverable error state without exposing secrets or provider details.

---

### User Story 2 - Run One Authoritative Backend (Priority: P2)

As a teammate or operator, I can install, test, and run the repository with the imported AI gateway as its only active backend, without accidentally building or deploying the superseded backend.

**Why this priority**: Keeping two active backend stacks would create ambiguous ownership, duplicated security policy, and unreliable onboarding.

**Independent Test**: Follow the root quickstart from a clean clone and verify that root commands and deployment definitions start the gateway and its required services, do not start the legacy backend, and expose working liveness, readiness, model discovery, and chat operations.

**Acceptance Scenarios**:

1. **Given** a clean clone of the integration branch, **When** a teammate follows the root setup instructions, **Then** one documented command starts Liara, ZarinPal's disconnected shell, the gateway, and its required runtime dependencies.
2. **Given** the complete stack is running, **When** an operator inspects its services and public routes, **Then** no legacy backend process or legacy conversation endpoint is active.
3. **Given** the gateway's enforcement dependency is unavailable, **When** readiness is checked, **Then** the gateway reports not ready and refuses requests whose limits cannot be enforced correctly.

---

### User Story 3 - Preserve Product Boundaries (Priority: P3)

As a maintainer, I can verify that the merge preserves both source histories, connects only Liara, and leaves ZarinPal ready for a later dedicated integration rather than silently coupling it to the gateway.

**Why this priority**: The two challenge products have different future policies and data needs; premature ZarinPal integration would make later analytical work harder to specify and audit.

**Independent Test**: Inspect the integration branch ancestry and run both frontend smoke tests while monitoring gateway traffic; Liara completes chat requests, ZarinPal builds and renders but sends no gateway requests.

**Acceptance Scenarios**:

1. **Given** the completed integration branch, **When** its history is inspected, **Then** both source tips are ancestors and the source branch tips themselves remain unchanged.
2. **Given** ZarinPal is opened and exercised, **When** network activity is observed, **Then** it makes no request to the gateway and clearly identifies AI chat as unavailable or deferred.
3. **Given** Liara and ZarinPal are built independently, **When** either build is run from a clean clone, **Then** the ZarinPal build does not require gateway client integration and the Liara build validates its gateway contract.

### Edge Cases

- Model discovery succeeds but returns zero models, multiple models, or a model identifier different from the configured public alias.
- A streaming response splits JSON across network chunks, ends without a completion marker, emits duplicate completion markers, or disconnects mid-stream.
- The visitor reloads the page after previous local conversation state was written by the retired chat implementation.
- The browser sends an allowed, disallowed, or missing origin and the gateway must enforce the configured browser-origin policy.
- A request exceeds message, body, token, concurrency, or anonymous usage limits.
- The upstream model times out, returns malformed data, or includes protected provider/model information.
- Redis or the configured upstream is unavailable during startup or becomes unavailable during a conversation.
- A developer runs a legacy root command copied from older documentation.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: The integration branch MUST contain both source branch histories, and creating it MUST NOT move or rewrite either source branch tip.
- **FR-002**: The imported AI gateway MUST become the repository's sole active backend for build, test, local startup, and deployment workflows.
- **FR-003**: The superseded backend MUST be removed from active workspace discovery, root commands, container definitions, deployment documentation, and runtime health dependencies.
- **FR-004**: The public gateway MUST provide OpenAI-compatible model discovery and chat-completion operations at `/v1/models` and `/v1/chat/completions`.
- **FR-005**: Chat completions MUST support both non-streaming JSON and ordered server-sent event streaming with exactly one terminal completion marker.
- **FR-006**: Gateway failures MUST use the OpenAI-compatible error envelope and MUST not disclose upstream credentials, protected model names, internal destinations, stack traces, or raw provider responses.
- **FR-007**: Liara Docs MUST discover or use the configured public model alias and send chat requests directly through the OpenAI-compatible contract.
- **FR-008**: Liara Docs MUST render streaming text incrementally, support cancellation, preserve the visible conversation during the current browser session, and send required prior messages with follow-up requests.
- **FR-009**: Liara Docs MUST translate gateway validation, limit, readiness, timeout, and upstream failures into recoverable Persian-first UI states while retaining request identifiers useful for support.
- **FR-010**: Browser access to the gateway MUST be restricted to explicitly configured origins and methods; upstream keys and identity secrets MUST remain server-side.
- **FR-011**: Anonymous rate, token, quota, concurrency, body-size, and request-lifetime protections from the imported gateway MUST remain enforced after repository integration.
- **FR-012**: Root local orchestration MUST include the gateway, its enforcement store, Liara Docs, and the ZarinPal shell, with health-based startup ordering where readiness is required.
- **FR-013**: Local orchestration MUST offer a deterministic mock-upstream path that can demonstrate model discovery, non-streaming chat, and streaming chat without a paid provider credential.
- **FR-014**: ZarinPal MUST remain independently buildable and renderable but MUST NOT import the gateway client, call gateway routes, or present its chat as operational in this feature.
- **FR-015**: Contract tests MUST cover model discovery, non-streaming completion, streaming completion, cancellation/disconnect, error sanitization, configured browser origins, and Liara request/response adaptation.
- **FR-016**: Root onboarding and deployment documentation MUST contain one authoritative backend setup, environment-variable inventory, health checks, local smoke test, and independent Liara deployment procedure.
- **FR-017**: The repository MUST retain the imported gateway's attribution, existing test suites, and operational documentation unless a replacement is explicitly documented and verified.
- **FR-018**: No public release may proceed until the existing frontend framework release gate and the integrated gateway acceptance checks both pass.

### Key Entities

- **Public model**: The single non-sensitive model identifier advertised to clients and returned in gateway responses; it maps internally to a protected upstream model.
- **Chat completion request**: An ordered set of conversation messages, the public model identifier, streaming choice, and bounded generation options sent by Liara.
- **Chat completion stream**: Ordered response events containing incremental assistant content and one terminal marker, or a bounded error.
- **Browser conversation**: The messages currently visible to a Liara visitor and supplied again when context is needed; the gateway does not own a message-history resource.
- **Anonymous usage identity**: A non-reversible identifier derived by the gateway for enforcing usage limits without collecting a user account.
- **Gateway readiness state**: Whether the gateway can safely route requests and make correct admission decisions using its required dependencies.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: 100% of the defined Liara smoke scenarios—initial question, incremental response, follow-up context, cancellation, reload handling, and recoverable failure—complete without a legacy backend process.
- **SC-002**: An OpenAI-compatible reference client completes model discovery, one non-streaming chat, and one streaming chat against the integrated gateway with no client-specific workaround beyond an anonymous placeholder credential when required by the client library.
- **SC-003**: In local mock mode, users see the first visible response increment within 2 seconds for at least 95% of 20 sequential smoke requests on the supported development machine.
- **SC-004**: All contract, security, and affected frontend tests pass, including 100% of cases for sanitized errors, origin enforcement, stream termination, and ZarinPal non-connection.
- **SC-005**: A teammate can go from clean clone and documented environment setup to a ready gateway and both rendered frontends within 15 minutes, excluding image download time.
- **SC-006**: Repository inspection finds zero active build, startup, deployment, or documentation references that instruct users to run the superseded backend.
- **SC-007**: Both original source commit IDs remain unchanged and are ancestors of the integration branch after completion.

## Assumptions

- The imported `ai-gw` implementation and its OpenAI-compatible public behavior are the selected backend baseline; provider selection and RAG behavior are not reopened by this feature.
- Conversation history is client-managed for this increment because the gateway accepts messages as request input and does not expose message-history storage.
- Anonymous access is appropriate for the hackathon demonstration; account authentication and cross-device history are deferred.
- The gateway advertises one public model alias, and Liara treats zero or multiple advertised models as a configuration error rather than choosing unpredictably.
- ZarinPal's existing visual shell remains in the repository, but its chat entry is disabled or explicitly marked as deferred until a later specification defines analytics-aware behavior.
- PostgreSQL, DuckDB, and the legacy conversation schema are not required by the Liara gateway integration and leave the active stack with the superseded backend.
- The real provider URL, provider key, identity secret, deployment epoch, and allowed browser origins are supplied through runtime configuration.
- The current constitution explicitly names the superseded backend architecture; its architecture constraint MUST be amended through the governed constitution workflow before implementation planning is approved.

## Out of Scope

- ZarinPal gateway connectivity, analytical tools, or merchant-specific AI behavior.
- Retrieval, embeddings, citations, documentation ingestion, or answer-quality evaluation beyond preserving future extension points.
- User accounts, server-stored conversation history, cross-device synchronization, or personalization.
- Multiple public models, provider selection by clients, fallback routing, tool execution, or arbitrary upstream destinations.
- Public deployment while the frontend framework release gate remains unresolved.
