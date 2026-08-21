# Structured Logging Contract

**Schema version**: `1`
**Encoding**: One UTF-8 JSON object per line (JSON Lines)
**Sink**: Local process stdout; constant emergency degradation notices may use stderr
**Retention/search**: External operator responsibility; the gateway stores no logs

All application events pass through a schema-first allowlist processor before serialization. Production events never contain request/response bodies, message content, tool arguments/results, arbitrary headers, query strings, raw paths, raw or upstream error bodies, secrets, raw client IPs, stack traces, or filesystem/internal network details.

Uvicorn access logging is disabled. Framework, HTTP client, Redis client, and server exception logging is intercepted or configured to emit only the bounded categories in this contract; no default logger may bypass the allowlist. A top-level exception boundary returns a sanitized response and prevents raw tracebacks from reaching production stdout/stderr.

## Common Envelope

Every event has exactly these common fields plus the event-specific fields documented below.

| Field | Type | Rules |
|---|---|---|
| `schema_version` | integer | Always `1` |
| `timestamp` | string | UTC RFC 3339 with fractional seconds and `Z` |
| `severity` | string enum | `debug`, `info`, `warning`, `error`, `critical` |
| `event` | string enum | One documented event name |
| `service` | string | Always `ai-gateway` |

Unknown fields are dropped before serialization. All strings are length-bounded, valid UTF-8, and have CR/LF/control characters normalized so one call cannot forge another JSON line.

## Canonical Request Outcome

### Event: `request.completed`

Exactly one event is constructed per chat request lifecycle, including middleware-level rejection and interrupted streams. While the local queue and stdout pipeline report healthy, exactly one event is delivered and correlates with the returned request ID. During declared logging degradation, delivery may be dropped as defined below; request behavior never blocks on recovery.

| Field | Type | Required | Rules |
|---|---|---:|---|
| `request_id` | UUID string | Yes | Gateway generated; same value returned in `x-request-id`; inbound request-ID headers ignored |
| `route` | enum | Yes | `chat`; derived from matched route, never raw path |
| `model_name` | string | Conditional | Configured public alias only after exact model validation; invalid caller model is never echoed |
| `model_match` | boolean/null | Yes | Null before valid model extraction; false only for a confirmed mismatch |
| `client_ref` | HMAC hex/base64 string | Yes | Deployment-scoped pseudonym for baseline correlation; never raw/reversible IP |
| `streaming` | boolean/null | Yes | Null before body validation establishes the request mode |
| `admission` | enum | Yes | `allowed`, `not_evaluated`, `client_rpm`, `client_tpm`, `client_concurrency`, `client_quota`, `global_rpm`, `global_tpm`, `global_concurrency`, `global_quota`, `state_unavailable`, `state_inconsistent` |
| `outcome` | enum | Yes | Same bounded outcomes as `ai_gateway_chat_requests_total` |
| `failure_category` | enum/null | Yes | One value from the closed list below; never arbitrary exception text |
| `http_status` | integer | Yes | Normalized response status |
| `status_class` | enum | Yes | `2xx`, `4xx`, `5xx` |
| `request_duration_seconds` | non-negative number | Yes | Full ASGI lifecycle |
| `upstream_duration_seconds` | non-negative number/null | Yes | Present only if provider dispatch began |
| `input_tokens` | non-negative integer/null | Yes | Trustworthy provider usage only |
| `output_tokens` | non-negative integer/null | Yes | Trustworthy provider usage only |
| `charged_tokens` | non-negative integer/null | Yes | Actual or conservative enforcement charge; not conversation content |
| `retry_after_seconds` | non-negative integer/null | Yes | Safe bounded retry indication |

Example:

```json
{"schema_version":1,"timestamp":"2026-08-20T12:00:00.000000Z","severity":"info","event":"request.completed","service":"ai-gateway","request_id":"3d0bd353-a024-4929-b459-3358d3d21119","route":"chat","model_name":"liara-chat","model_match":true,"client_ref":"HMAC_REDACTED_EXAMPLE","streaming":false,"admission":"allowed","outcome":"success","failure_category":null,"http_status":200,"status_class":"2xx","request_duration_seconds":0.842,"upstream_duration_seconds":0.811,"input_tokens":12,"output_tokens":21,"charged_tokens":33,"retry_after_seconds":null}
```

The example pseudonym is an obvious placeholder and is never copied into runtime state.

### Failure categories

`null`, `invalid_content_type`, `invalid_framing`, `body_too_large`, `invalid_json`, `schema_invalid`, `depth_limit`, `count_limit`, `model_mismatch`, `identity_unavailable`, `client_rpm`, `client_tpm`, `client_concurrency`, `client_quota`, `global_rpm`, `global_tpm`, `global_concurrency`, `global_quota`, `redis_connection`, `redis_timeout`, `redis_ambiguous`, `marker_mismatch`, `script_unavailable`, `reservation_underestimated`, `upstream_dns`, `upstream_tls`, `upstream_connect`, `upstream_pool_timeout`, `upstream_write_timeout`, `upstream_read_timeout`, `upstream_total_timeout`, `upstream_http_4xx`, `upstream_http_5xx`, `upstream_rate_limited`, `upstream_invalid_json`, `upstream_malformed_sse`, `upstream_oversized`, `upstream_protocol`, `client_cancelled`, `internal`.

### Severity rules

- `info`: successful requests, expected local validation/model rejections, and authoritative client/global limit rejections.
- `warning`: client cancellation, provider 4xx/rate limit, malformed provider output, logging/metrics degradation, and transient enforcement unavailability.
- `error`: provider transport/5xx failures, reservation underestimation, marker inconsistency, repeated Redis/script failure, or an unexpected gateway error.
- `critical`: reserved for a startup invariant violation that prevents serving; request events never use it.

`request_id`, `client_ref`, `deployment_id`, and `enforcement_epoch` are at most 128 characters; event/category/route/status enums at most 64; all other strings at most 256. Invalid field types, unknown enum values, and unknown keys are dropped from the event. If a required field cannot be made valid, serialization is abandoned, the dropped-event metric increments, and a constant degradation notice may be emitted.

## Service Lifecycle Events

### `service.starting`

Fields: `deployment_id`, `enforcement_epoch`, `config_schema_version`. Does not include provider/model/Redis URLs, secret fingerprints, policies, or environment dumps.

### `service.ready`

Fields: `deployment_id`, `enforcement_epoch`. Emitted once when readiness becomes true.

### `service.unready`

Fields: `reason` enum: `starting`, `draining`, `redis_unavailable`, `epoch_mismatch`, `script_unavailable`, `state_inconsistent`, `shutdown`. Repeated identical transitions are rate-limited.

### `service.stopping`

Fields: `in_progress_requests` (integer), `drain_deadline_seconds` (number).

No lifecycle event contains live per-client/global usage or remaining limits.

Lifecycle fields are required exactly as listed: `deployment_id` and `enforcement_epoch` are validated strings up to 64 characters; `config_schema_version` is the constant string `v1`; `reason` is one of the documented enums; `in_progress_requests` is a non-negative integer; and `drain_deadline_seconds` is a finite non-negative number. Starting/ready/stopping are `info`, unready is `warning` except `shutdown`/`draining` transitions are `info`.

## Enforcement and Security Events

### `enforcement.degraded`

Emitted at a rate-limited cadence for Redis timeouts, ambiguous results, marker mismatch, or script reload failures.

Fields:

- `reason`: `connection`, `timeout`, `ambiguous_write`, `epoch_mismatch`, `noscript_reload`, `invalid_state`
- `readiness`: always `false`
- `request_id`: optional generated ID if tied to a request

`enforcement.degraded` has severity `warning`, promoted to `error` after the implementation's fixed repeated-failure threshold; `reason` and `readiness` are required and `request_id` is optional.

### `security.request_rejected`

Used only when the rejection is useful beyond the canonical request outcome.

Fields:

- `request_id`
- `category`: `body_too_large`, `invalid_content_type`, `invalid_json`, `depth_limit`, `count_limit`, `model_mismatch`, `untrusted_forwarding`, `unsafe_path`, `header_violation`
- `route`: closed matched-route enum or `unknown`; never the submitted raw path

Do not emit submitted model/path/header values.

`security.request_rejected` has severity `info` for ordinary validation and `warning` for `untrusted_forwarding`, `unsafe_path`, or `header_violation`. All three documented fields are required.

## Logging Degradation

### `logging.degraded`

Normal structured emission is attempted only when the queue/sink remains usable. A constant emergency stderr line may be used instead:

```text
ai-gateway logging degraded; events may be dropped
```

It is rate-limited and contains no request data. The corresponding metric is authoritative for operator detection.

## Queue and Failure Semantics

- Fixed-capacity, drop-new, non-blocking queue.
- Request processing never waits for a remote collector; there is no network log handler.
- Queue-full increments `ai_gateway_log_events_dropped_total{reason="queue_full"}`.
- Serialization failure increments reason `serialization_error`; sink write failure increments `sink_error`.
- Failures do not change chat admission, quota charging, response status, or readiness.
- Shutdown attempts a bounded queue drain, then drops remaining events and reports the count through the metric while the process remains alive.
- If shutdown loss occurs after the final useful metrics scrape, one bounded constant stderr notice is emitted before exit.
- The logger never logs its own exception through the same failed queue.

## Redaction and Prohibited Fields

The allowlist processor must reject event dictionaries containing keys or aliases for:

- `authorization`, API/master/operator/Redis keys, passwords, cookies, tokens-as-secrets, or complete environment/configuration
- `messages`, `prompt`, `content`, `response`, `body`, tool/function arguments/results, or structured-output values
- Raw IP/forwarded chain, request headers, query strings, raw/full URLs, upstream host/model, or filesystem paths
- Raw exception message, traceback/stack, provider error response, DNS/TLS detail, or arbitrary status text
- Remaining quota, another client's identity/state, or a reservation/window dump

Security tests seed unique canaries into every prohibited input and assert that no emitted line or emergency notice contains them.

## Compatibility and Versioning

- Event and field enums may gain values only with a schema-contract update and bounded-cardinality review.
- Existing field types cannot change within schema version 1.
- Additional event-specific fields require an allowlist update, documentation, redaction test, and consumer notice.
- Human-friendly console logs may exist only in an explicit local-development mode; automated tests and production images always use JSON Lines.
