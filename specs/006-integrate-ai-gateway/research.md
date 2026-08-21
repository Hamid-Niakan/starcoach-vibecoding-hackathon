# Phase 0 Research: Integrate AI Gateway

## Decision 1: Treat `ai-gw/` as the sole backend

**Decision**: Preserve the imported FastAPI implementation and its Python/uv project boundary.
Remove `apps/api/` from the pnpm workspace, root scripts, Compose, deployment files, environment
examples, and onboarding. Keep both source commits as ancestors of the integration branch.

**Rationale**: The gateway already supplies fixed-destination OpenAI compatibility, Redis-backed
atomic enforcement, sanitization, readiness, metrics, and extensive tests. Retaining NestJS as a
second active backend would violate the constitution and leave ownership ambiguous.

**Alternatives considered**:

- Port the gateway into NestJS: rejected because it discards the selected implementation and
  duplicates security-sensitive logic.
- Run both services behind a router: rejected because persisted conversations and stateless
  completions are incompatible ownership models for this feature.
- Copy gateway modules into `apps/`: rejected because it needlessly rewrites imported provenance
  and the independent Python project.

## Decision 2: Use the gateway OpenAPI document as producer authority

**Decision**: Keep Pydantic/FastAPI models and `/openapi.json` authoritative for the public service.
Treat `contracts/openapi.yaml` as the Liara consumer profile, not a second producer schema. Rewrite
`@hackathon/contracts` as a strict Zod subset for the browser-consumed model list, completion
request/chunks, errors, and versioned session state. Add automated subset/parity tests against the
live `/openapi.json` and exercise the running gateway with the TypeScript client instead of
attempting cross-language source imports.

**Rationale**: The gateway cannot depend on Node packages, and the constitution prohibits
consumers from importing gateway internals. Runtime validation at the browser boundary catches
contract drift while preserving independent builds.

**Alternatives considered**:

- Generate all TypeScript types from OpenAPI: deferred because the supported gateway request
  surface is much larger than Liara needs and generator churn would obscure this integration.
- Keep the legacy conversation/SSE schemas: rejected because those routes no longer exist.
- Make Zod the producer schema: rejected because it would reverse the application-to-gateway
  dependency boundary.

## Decision 3: Implement a small fetch-based OpenAI client

**Decision**: Rewrite `@hackathon/api-client` around `GET /v1/models` and
`POST /v1/chat/completions`. It accepts a gateway origin, sends no credential by default, permits a
documented non-secret placeholder Bearer value for SDK parity tests, parses non-streaming JSON, and
parses raw SSE incrementally with `TextDecoder`. It validates every JSON event, accepts one
`[DONE]`, rejects a missing terminal marker, preserves the gateway request ID response header, and
aborts the reader through the caller's `AbortSignal`. The parser accepts LF and CRLF boundaries and
comments, caps a single event at 256 KiB, its undecoded buffer at 512 KiB, the full stream at 64
MiB/100,000 events, and accumulated assistant text at 1 MiB. It accepts the first public `[DONE]`,
cancels the reader immediately, and does not wait for EOF; producer tests guarantee the gateway
emits at most one marker. The gateway emits its public marker only after observing a valid upstream
marker; upstream EOF or failure before that point closes the public stream without `[DONE]`, while
the first upstream marker closes the upstream response and is normalized to one public marker.
The static Liara export receives one credential-free gateway origin through the canonical
`NEXT_PUBLIC_AI_GATEWAY_URL` build argument; the client rejects userinfo/query/fragment values and
appends `/v1` routes itself. Changing the public gateway origin requires rebuilding Liara.

**Rationale**: Browser `EventSource` cannot issue POST requests, while the Fetch streaming API can
carry the OpenAI request body and propagate cancellation. A narrow client makes protocol failure
states independently testable.

**Alternatives considered**:

- Use the OpenAI JavaScript SDK in the browser: rejected for this increment because it adds a large
  dependency and browser opt-in configuration for only two operations.
- Add a Next.js server proxy: rejected because the clarified contract requires direct browser
  access and the static-exported Liara site has no application server.
- Reuse the legacy custom SSE events: rejected because the gateway emits OpenAI chunks and
  `[DONE]`.

## Decision 4: Keep conversation state in versioned `sessionStorage`

**Decision**: Store `{version: 1, model, messages, updatedAt}` under a Liara-specific key in
`sessionStorage`. Restore only structurally valid version-1 state in the same tab; remove invalid,
legacy, or unsupported-version values. Persist bounded partial content at the UI update cadence and
normalize any restored `streaming` assistant message to `stopped`, because its request and abort
handle no longer exist. Never store credentials, request IDs as identity, upstream details, or
active stream handles. Browser tests open an independent `noopener` context because browsers may
clone a source tab's session storage into a normal opener-created tab.

**Rationale**: Session storage survives reloads but ends with the tab, exactly matching the
clarification and avoiding server-side history or long-lived anonymous data.

**Alternatives considered**:

- `localStorage`: rejected because it persists across browser restarts.
- In-memory state: rejected because it loses the conversation on reload.
- Redis/PostgreSQL history: rejected because server-owned conversations are out of scope.

## Decision 5: Define cancellation as a first-class message state

**Decision**: Model assistant messages as `streaming`, `completed`, `stopped`, or `failed` and give
each user/assistant pair a shared browser-only `turnId`. Cancellation aborts fetch, retains
accumulated text as `stopped`, persists it, and includes it as an assistant message in future
requests. Retrying removes/replaces only the stopped assistant with the same `turnId` while
retaining its paired user message. Zod refinements enforce role/status, one active stream, turn
ordering, and error-field invariants that JSON Schema cannot express concisely.

**Rationale**: This keeps visible and transmitted context aligned and gives retry deterministic
semantics without inventing a gateway resource.

**Alternatives considered**:

- Delete partial output: rejected by the clarification.
- Keep but omit it from future messages: rejected because the visitor could refer to visible text
  the model never receives.
- Ask on every cancellation: rejected as unnecessary interaction cost.

## Decision 6: Discover exactly one model per browser session

**Decision**: The chat state machine performs model discovery before the first completion and
caches the validated public alias in session storage. Zero, multiple, or malformed model values
enter a recoverable configuration-error state and prevent completion dispatch. The browser does
not receive or duplicate a protected upstream identifier; gateway security/parity tests prove it is
absent from discovery and responses.

**Rationale**: `/v1/models` is static, local to the gateway, and does not query Redis or the
provider. One discovery per session keeps the gateway authoritative without repeated requests.

**Alternatives considered**:

- Frontend build-time alias: rejected because it duplicates runtime configuration.
- Choose the first model: rejected because it hides a broken single-model invariant.
- Discover on every message: rejected as unnecessary traffic.

## Decision 7: Make anonymous CORS behavior explicit

**Decision**: Gateway chat and model routes require no authentication. CORS permits only configured
origins, `GET`, `POST`, and `OPTIONS`, plus `content-type` and optional `authorization` request
headers, and exposes `x-request-id` to allowed browser origins. A Bearer value is ignored at the
public boundary and is never forwarded; provider authorization is generated solely from server
configuration. Requests without an `Origin` header remain accepted for curl and OpenAI SDK
compatibility; CORS controls browser visibility and is not authentication.

**Rationale**: Some OpenAI clients require a placeholder key. Allowing the header maintains
compatibility, while origin checks and Redis admission—not a public token—provide the actual abuse
controls.

**Alternatives considered**:

- Shared frontend secret: rejected because browser-delivered secrets are public.
- Token issuance: deferred with user accounts/authentication.
- Wildcard CORS: rejected because it expands exposure and the gateway configuration already
  rejects it.

## Decision 8: Readiness covers configuration and Redis, not provider reachability

**Decision**: Invalid immutable configuration fails process startup before readiness exists. After
valid startup, a gateway instance is ready only when Redis is reachable, enforcement scripts are
loaded, the deployment/epoch marker matches, and no inconsistency marker exists. It does not probe
the upstream. Provider DNS, transport, timeout, malformed response, and HTTP failures remain
sanitized per-request errors.

**Rationale**: Redis is required to make safe admission decisions and therefore must fail closed.
Provider probes can create cost, rate-limit, and restart-loop problems and do not guarantee the next
request will succeed.

**Alternatives considered**:

- Probe Redis and provider: rejected because transient provider failures should not destabilize
  orchestration.
- Process-only readiness: rejected because it could admit unenforced requests.
- In-process limit fallback: rejected because it breaks multi-instance atomicity.

## Decision 9: Add an explicit enforcement bootstrap service

**Decision**: Root and gateway deployment Compose definitions include a one-shot
`gateway-bootstrap` service using the exact gateway image and environment. The gateway waits for
Redis health and successful bootstrap completion; frontends that need the gateway wait for gateway
readiness. Docker health checks use `/health/readiness`, not liveness. Root mock mode supplies
clearly labeled fixture-only values that satisfy startup validation; deployment overlays require
operator-provided secrets and never inherit fixture values.

**Rationale**: `RedisEnforcementStore.start()` rejects a missing or mismatched marker. Making
bootstrap explicit keeps policy changes deliberate and startup deterministic.

**Alternatives considered**:

- Bootstrap silently inside every gateway replica: rejected because incompatible policy changes
  must not race or overwrite markers.
- Commit Redis state: rejected because runtime state does not belong in Git.
- Skip bootstrap in local mode: rejected because local behavior must match production enforcement.

## Decision 10: Disconnect ZarinPal at dependency and network boundaries

**Decision**: Remove `@hackathon/api-client`, `@hackathon/chat-ui`, and
`@hackathon/contracts` from the ZarinPal application; remove the chat stylesheet and API build
argument; render a disabled Persian “deferred” assistant card. ZarinPal has no gateway dependency
or health ordering in Compose.

**Rationale**: A disabled UI alone would still leave accidental coupling. Removing imports,
configuration, and Compose dependencies makes non-connection mechanically testable.

**Alternatives considered**:

- Leave the shared chat mounted but disabled: rejected because code and environment coupling remain.
- Connect mock-only chat: rejected because it silently implements deferred scope.
- Remove the entire dashboard: rejected because it must remain independently renderable.

## Decision 11: Test at protocol, state-machine, browser, and orchestration levels

**Decision**: Preserve all gateway suites and extend them for optional Authorization CORS, exposed
request IDs, total deadlines, and the clarified readiness contract. Add jsdom, Testing Library, and
axe-compatible Vitest tests for Zod refinements, bounded split SSE chunks, missing terminal marker,
sanitized error mapping, storage restoration, cancellation, retry replacement, model cardinality,
and streaming accessibility. Add a pinned Playwright dependency, root configuration, and
desktop/mobile flows against the deterministic stack, including a network assertion that ZarinPal
sends no gateway request and a 20-request first-increment latency gate. Validate Compose
configurations and the two pinned source commit IDs as ancestors.

**Rationale**: Each layer owns a distinct failure class; browser tests alone cannot prove gateway
security, and unit tests alone cannot prove CORS, static-export configuration, or cancellation.

**Alternatives considered**:

- Manual smoke testing only: rejected because critical regression gates would be non-repeatable.
- End-to-end testing only: rejected because malformed stream and enforcement cases need precise
  fixtures.
- Gateway tests only: rejected because the current frontend speaks an incompatible legacy contract.

## Decision 12: Retain the framework release block

**Decision**: Build and test Next.js 14 images locally, retain `release:check`, and state in all
deployment validation that public release is blocked until the supported-version feature passes.

**Rationale**: Framework upgrading is explicitly outside this feature and the constitution forbids
conflating a successful local image with production eligibility.

**Alternatives considered**:

- Upgrade Next.js during integration: rejected as unplanned scope with high upstream-doc risk.
- Remove the release check temporarily: rejected because it weakens a constitutional gate.

## Decision 13: Configure trusted proxies as an operator-owned security boundary

**Decision**: Direct local access leaves `AI_GATEWAY_TRUSTED_PROXY_CIDRS` empty. Any deployment
behind an ingress MUST set it to the smallest known ingress CIDR set and configure the hop limit;
the gateway must never infer or trust all private networks. Tests prove spoofed forwarding headers
are ignored from untrusted peers and resolved only through trusted peers. Deployment documentation
warns that an empty value behind ingress collapses clients into the ingress identity and shared
limits.

**Rationale**: Anonymous enforcement derives identity from the canonical client address. Blindly
trusting forwarded headers enables quota evasion, while trusting no ingress address makes every
visitor share one quota.

**Alternatives considered**:

- Trust all private CIDRs: rejected because container/network topology is not an authorization
  boundary.
- Always use the direct peer: safe against spoofing but rejected for production ingress because it
  collapses all users.
- Accept a caller-supplied user ID: rejected because authentication is out of scope.

## Decision 14: Enforce wall-clock request and stream deadlines

**Decision**: Apply an absolute `max_request_seconds` deadline to non-streaming processing and an
absolute `max_stream_seconds` deadline to the complete streaming lifecycle. Deadline expiry closes
the upstream response, cancels pending work, reconciles the Redis reservation conservatively, and
returns a sanitized 504 before headers or an incomplete stream after headers. Per-operation HTTPX
timeouts remain defense in depth but do not replace the wall-clock deadline.

**Rationale**: HTTP read timeouts reset when bytes arrive and therefore do not stop a trickle
response. The imported configuration and enforcement lease already assume absolute limits, so the
runtime must honor them.

**Alternatives considered**:

- HTTPX timeouts alone: rejected because a slow continuous stream can live indefinitely.
- Client-side timeout only: rejected because upstream resources and Redis leases are server-owned.
- Process kill/restart: rejected because it disrupts unrelated requests and loses precise
  reconciliation.

## Decision 15: Separate visual token updates from assistive announcements

**Decision**: Continue rendering token deltas visually, mark the conversation region `aria-busy`
while streaming, and use a separate polite status region for start, completion, cancellation, and
error announcements. The changing Markdown body is not itself a live region, so screen readers do
not repeat every token. Stop and retry remain visible keyboard buttons; completion/cancellation
returns focus to the composer, while an actionable error focuses its recovery control. Code, URLs,
and identifiers remain isolated LTR content inside RTL chrome.

**Rationale**: Announcing every streamed delta produces unusable repeated speech. State-level
announcements preserve awareness without sacrificing the visible incremental experience.

**Alternatives considered**:

- Put `aria-live` on the whole message list: rejected because every delta may be re-announced.
- Announce nothing until completion: rejected because cancellation and long-running state become
  unclear.
- Disable incremental visual rendering: rejected because streaming is a core acceptance behavior.
