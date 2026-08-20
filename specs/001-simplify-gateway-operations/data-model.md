# Data Model: Simplified Gateway Operations

**Date**: 2026-08-20

This feature has no business database. The model consists of immutable startup configuration, transient request objects, expiring Redis enforcement state, process-local metrics, and externally emitted log events. Conversation content exists only in memory for the lifetime of an active request.

## 1. Proxy Config

Immutable configuration validated before readiness.

| Field group | Fields | Validation |
|---|---|---|
| Single model | public alias, upstream model, API base, API key | Exactly one scalar value for each; non-placeholder secret; exact public-model comparison; normalized fixed endpoint; no URL userinfo/query/fragment; HTTPS except explicit loopback development mode |
| Enforcement identity | `deployment_id`, `enforcement_epoch`, `identity_secret`, `trusted_proxy_cidrs` | Deployment/epoch use restricted key-safe syntax; secret decodes to exactly 32 random bytes; values are stable across replicas; CIDRs parse canonically; rotation requires restart and coordinated epoch cutover |
| Redis | `redis_url`, TLS/auth options, connect/operation timeouts | One authoritative primary; no replica-read or local fallback mode; startup/readiness fail closed |
| Per-client policy | `rpm`, `tpm`, `max_concurrency`, `quota_tokens`, `quota_window_seconds` | Positive integers; quota window exceeds maximum request lifetime; all limits have safe upper bounds |
| Global policy | Same five policy values | Positive integers and not smaller than an internally inconsistent deployment minimum |
| Request safety | Body and inbound-header bytes/count, nesting depth, message/tool counts, provider-verified maximum input tokens, output-token cap, request and stream lifetime | Positive bounded values; worst-case input plus `n ×` output reservation fits both client and global token/quota policy; effective caller output maximum never exceeds operator cap |
| Transport | Connect/read/write/pool timeouts, pool sizes, inbound forwarding bounds, upstream header/JSON/SSE-event/buffer/stream/event-count bounds, local/private upstream exceptions, CORS/HSTS settings | Finite and mutually consistent; redirects, compression, and environment proxy inheritance disabled; production egress policy required |
| Observability | Log level, queue capacity, histogram buckets | Bounded enumerations/positive values; cannot introduce dynamic labels, remote log sinks, tracing, or persistence |

**Relationships**:

- Contains exactly one `Single Model Config`.
- Contains one `Usage Policy` for anonymous clients and one for the whole gateway.
- Determines Redis key namespace, request validation bounds, metric initialization, and log schema version.
- Produces a canonical enforcement-policy fingerprint from every value that changes admission, reservation, identity, window, or expiry semantics.

**Lifecycle**: `unloaded → validated → active → shutting_down`. There is no active-to-active reload transition; configuration changes require a new process.

## 2. Single Model Config

The only outbound chat route.

| Field | Type | Persisted | Notes |
|---|---|---:|---|
| Public model alias | bounded string | Configuration only | Required exact value in every caller request and safe to expose after validation |
| Upstream model | bounded string | Configuration only | Protected provider/model identifier; replaces the public alias immediately before dispatch and is never returned or logged |
| Provider API base | normalized HTTPS URL | Configuration only | Fixed provider API prefix; never returned or logged |
| Provider API key | secret string | Secret source only | Provider authorization value; never stored in Redis or emitted |
| `chat_completions_url` | derived URL | Memory only | Constructed once from `api_base`; caller input never participates |

### ModelInfoResponse Projection

A response-only value derived from the validated `model_name`; it is not persisted and never queries the upstream.

| Field | Type | Value/rule |
|---|---|---|
| `id` | bounded string | Exact configured public model alias |
| `object` | constant string | `model` |
| `created` | constant integer | `0`, providing a deterministic compatibility value without deployment metadata |
| `owned_by` | constant string | `ai-gateway` |

`GET /v1/models` wraps exactly one projection in `{ "object": "list", "data": [...] }`. The projection is immutable for the process lifetime and contains no upstream model, provider address, credential, capabilities, prices, limits, or live state.

## 3. ProxyChatCompletionRequest

Validated request-scoped data. The OpenAPI contract is authoritative for its public fields.

| Field | Type | Rules |
|---|---|---|
| `model` | string | Required and exactly equal to the configured public alias; rewritten to the protected upstream model only in the outbound copy |
| `messages` | non-empty discriminated list of role-specific messages | Roles/content/tool relationships validated; total size/count/nesting bounded; image/audio/file inputs are inline only; remote media URLs and provider `file_id` references are rejected |
| Generation controls | optional bounded scalars/lists | Includes temperature, top-p, penalties, stop, seed, logprob controls, and one effective output maximum |
| Tool controls | optional tool definitions and choices | Schema/count/size bounded; gateway does not execute tools |
| Structured output | optional response-format object | Validated and passed through; gateway does not interpret the generated content |
| Streaming controls | `stream`, optional `stream_options` | Streaming usage requested upstream when supported so trustworthy final usage can be reconciled |
| `user` | optional string | Passed only as supported payload; never used as enforcement identity |

**Not accepted**: upstream URL/key fields, provider names, alternate model routes, retries, fallbacks, caches, guardrails, gateway-specific routing metadata, management options, or arbitrary unknown fields outside the recorded compatibility baseline.

Successful non-streaming output is represented as `ModelResponse`; streaming events use `ModelResponseStream`; trustworthy token totals use `Usage`. Their fields remain limited to the OpenAPI contract and never expose protected destination configuration.

**Lifecycle**: `received → bounded → validated → reserved → streaming|buffering → finalized`. A request rejected before `reserved` never contacts Redis for admission or the provider. A request rejected after an ambiguous Redis write never contacts the provider. Every successful admission is conservatively chargeable even if a later local failure proves no provider bytes were sent.

## 4. Anonymous Client Identity

A deterministic pseudonymous value calculated for each request.

| Field | Type | Persisted | Notes |
|---|---|---:|---|
| `effective_ip` | address-family byte plus canonical packed IP | No | Derived from the direct peer and one bounded trusted `X-Forwarded-For` chain; IPv4-mapped IPv6 is normalized; discarded after HMAC derivation |
| `client_id` | 32-byte HMAC digest | Active enforcement keys only | Full base64url-no-padding `HMAC-SHA-256(identity_secret, b"anon-client:v1\x00" || family_byte || packed_ip)` |
| `identity_version` | fixed enum | Key namespace | Currently `v1`; prevents silent identity-algorithm changes |

The client cannot supply, select, enumerate, or recover `client_id`. Raw or encoded IP values never enter logs, metrics, errors, Swagger, or Redis.

## 5. Usage Policy

Two immutable instances exist: `client` and `global`.

| Field | Type | Meaning |
|---|---|---|
| `scope` | `client` or `global` | Which counters are evaluated |
| `requests_per_minute` | positive integer | Admitted attempts in an epoch-aligned 60-second window |
| `tokens_per_minute` | positive integer | Reserved/reconciled input plus output tokens in the same window |
| `max_concurrency` | positive integer | Active leases after stale members are pruned |
| `quota_tokens` | positive integer | Reserved/reconciled tokens in the configured quota window |
| `quota_window_seconds` | positive integer | Epoch-aligned, Redis-time-based reset interval |

Policy changes produce a new process configuration. Existing Redis window keys are bound to an `enforcement_epoch`; an operator must intentionally retain or replace that epoch rather than silently reinterpret active counters.

### Enforcement Scope Marker

One marker exists per validated `{deployment_id:enforcement_epoch}` scope and contains:

- Enforcement contract version
- Deployment ID and epoch
- Identity algorithm version and non-reversible identity-secret fingerprint
- Canonical fingerprint of both policies, maximum input/output reservation bounds, `n` ceiling, request/stream lifetime, reconciliation grace, and key/window semantics

Readiness and every admission require an exact marker match. Two replicas with different fingerprints cannot use the same scope. Any enforcement-relevant change requires a new epoch and a coordinated traffic cutover; old and new epochs may coexist in Redis only so old in-flight work can settle and expire.

## 6. Window Identity and Usage Window

Redis-only active enforcement data.

### Window Identity

| Field | Type | Notes |
|---|---|---|
| `scope` | enum | `client` or `global` |
| `client_id` | optional digest | Present only for client scope |
| `kind` | enum | `rpm`, `tpm`, or `quota` |
| `window_id` | integer | `floor(redis_time / window_seconds)` |
| `window_end` | epoch seconds | Source for `Retry-After` and TTL |

### Usage Window

| Field | Type | Notes |
|---|---|---|
| `used_or_reserved` | non-negative integer | Requests for RPM; tokens for TPM/quota |
| `expires_at` | epoch seconds | Window end plus maximum request/reconciliation grace |

Example key patterns (all share the deployment-and-epoch hash tag):

```text
aigw:enforcement:v1:{<deployment_id>:<enforcement_epoch>}:marker
aigw:enforcement:v1:{<deployment_id>:<enforcement_epoch>}:global:rpm:<window_id>
aigw:enforcement:v1:{<deployment_id>:<enforcement_epoch>}:global:tpm:<window_id>
aigw:enforcement:v1:{<deployment_id>:<enforcement_epoch>}:global:quota:<window_id>
aigw:enforcement:v1:{<deployment_id>:<enforcement_epoch>}:client:<client_id>:rpm:<window_id>
aigw:enforcement:v1:{<deployment_id>:<enforcement_epoch>}:client:<client_id>:tpm:<window_id>
aigw:enforcement:v1:{<deployment_id>:<enforcement_epoch>}:client:<client_id>:quota:<window_id>
```

Expired windows disappear by TTL. There is no reset worker, history query, client enumeration index, daily rollup, or statistics export.

## 7. Concurrency Lease

Two sorted sets, one client-scoped and one global, hold only active reservation IDs.

| Field | Type | Notes |
|---|---|---|
| `reservation_id` | gateway-generated UUID | Opaque member; contains no client, model, or request content |
| `expires_at` | epoch seconds score | Maximum request/stream lifetime plus grace |

Admission prunes scores at or before Redis time, checks cardinality, then inserts the new lease atomically with every counter update. Reconciliation removes the member with `ZREM`; duplicate removal is harmless. A crashed process self-heals at lease expiry.

## 8. Usage Reservation

The idempotency boundary between admission and settlement.

| Field | Type | Notes |
|---|---|---|
| `reservation_id` | UUID | Opaque enforcement identifier distinct from the caller-visible request ID |
| `state` | `open` or `finalized` | Mutated only by Lua |
| `enforcement_epoch` | bounded string | Prevents reconciliation across policy/deployment epochs |
| Window identities | bounded tuple set | Original RPM/TPM/quota windows; late settlement never charges a new window |
| Reserved input/output/total | non-negative integers | Provider-verified maximum input bound plus `n × effective_max_output_tokens` |
| Final charge | non-negative integers, optional | Present only during settlement; finalized record becomes a minimal tombstone |
| `expires_at` | epoch seconds | Latest affected window end plus grace |

### State transitions

```text
absent
  └─ admit allowed ─> open / conservatively reserved
                         ├─ trustworthy usage within bound ─> finalized / actual charge
                         ├─ cancel, timeout, crash, bad stream,
                         │  local failure, missing usage ─────> finalized / reserved charge
                         └─ reported usage above bound ───────> finalized / actual charge
                                                               + enforcement-inconsistent latch

finalized + duplicate reconcile ─> finalized / no-op
open + lease expiry              ─> conservative counters retained; concurrency pruned
```

A finalized record retains only the fields necessary to reject duplicate settlement until its TTL. It is not a completed-request record and cannot be queried through the gateway.

## 9. Admission Decision

Returned from Redis to the request pipeline and never persisted as analytics.

| Field | Type | Values |
|---|---|---|
| `allowed` | boolean | `true` or `false` |
| `reason` | bounded enum | `allowed`, `client_rpm`, `client_tpm`, `client_concurrency`, `client_quota`, `global_rpm`, `global_tpm`, `global_concurrency`, `global_quota`, `state_unavailable`, `state_inconsistent` |
| `retry_at` | optional epoch seconds | Window/lease time at which admission may succeed |
| `reservation_id` | optional UUID | Present only when allowed |

Only the bounded error category and safe `Retry-After` reach the caller. Remaining allowance and other clients' state never do.

## 10. Request Context and Outcome

Memory-only lifecycle context used to finalize metrics and emit one canonical log event.

| Field | Type | Notes |
|---|---|---|
| `request_id` | generated UUID | Returned in `x-request-id`; inbound values ignored |
| `client_ref` | HMAC digest text | Required in the canonical request outcome for baseline correlation; never a metric label or response field |
| `route` | closed enum | Derived from matched route template, never raw path |
| `model_name` | configured alias or null | Included only after exact-match validation; invalid submitted models are never echoed |
| `model_match` | boolean or null | Null until a valid body/model value is available; false only for a confirmed mismatch |
| `streaming` | boolean or null | Null until body validation establishes the request mode |
| `admission` | closed enum | Allowed or bounded rejection category |
| `outcome` | closed enum | Success, invalid, limited, unavailable, upstream error, timeout, cancelled, malformed, internal error |
| `status` | integer/status class | Normalized caller response |
| Durations | non-negative seconds | Request and upstream lifetimes |
| Trusted usage | optional input/output integers | Added once to metrics and reconciliation only when provider usage is trustworthy |
| Conservative charge | non-negative integer | Log/enforcement result; not a stored statistic |

The context is destroyed after finalization. The structured log collector outside the gateway owns any retention.

## 11. Enforcement Health Latch

Process-local readiness state backed by live Redis validation.

| State | Entry condition | Exit condition |
|---|---|---|
| `starting` | Process initialization | Configuration, authenticated primary, marker, and scripts validate |
| `ready` | Complete validation succeeds | Drain starts or any admission/reconciliation/marker/script/connection/type error occurs |
| `unready` | Dependency or consistency failure | A subsequent bounded complete readiness check succeeds |
| `draining` | Shutdown begins | Process exits; cannot return to ready |

Liveness does not inspect this latch or any dependency. Each readiness call performs a fresh bounded marker/script validation, so its response is not based only on a stale cached bit. The Prometheus readiness gauge is updated on startup, chat enforcement results, drain transitions, and readiness probes.

## 12. Operational Metric Series

Process-local values defined in `contracts/metrics.md`.

- Counter, gauge, and histogram objects exist only in memory.
- Label values come from compile-time closed enums.
- Input/output token counters are unlabelled aggregate totals.
- Request IDs, client IDs, model/provider values, URLs, error messages, and content are prohibited.
- All process-local values reset on process restart and are never authoritative for enforcement.

## Data Retention Matrix

| Data | Location | Maximum lifetime | Historical/operator query |
|---|---|---|---|
| Conversation request/response | Process memory | Active request/stream only | None |
| Raw effective IP | Process memory | Until HMAC derivation | None |
| Enforcement scope marker | Redis | Until operator retires the epoch after all operational TTLs expire | None; exact-match validation only |
| Active counters | Redis | Window end + reconciliation grace | None |
| Concurrency lease | Redis | Maximum request lifetime + grace | None |
| Reservation/tombstone | Redis | Latest affected window + grace | None |
| Metrics | Process memory | Process lifetime | Public current scrape only |
| Structured logs | External stdout collector | Operator-controlled outside gateway | No gateway query |
| Settings secrets | Environment/secret source and protected memory | Process lifetime | None |
