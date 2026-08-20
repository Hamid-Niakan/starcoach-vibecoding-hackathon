# Prometheus Metrics Contract

**Schema version**: `v1`
**Endpoint**: `GET /metrics`
**Access**: Public, unauthenticated, sanitized
**Retention**: Process-local only; counters reset on process restart

The endpoint exposes only an explicit custom registry. Default Python runtime, garbage-collector, process, framework, and build-information collectors are not registered. Prometheus collection is external and optional; scrape absence never affects readiness or chat behavior.

## Response Contract

- Status: `200 OK`
- Content type: `text/plain; version=0.0.4; charset=utf-8`
- Headers: `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`
- Body size: bounded by the fixed families and label enumerations below
- `/metrics`, `/v1/models`, health, and documentation requests do not increment chat request metrics
- Content negotiation and gzip are disabled; the endpoint always emits the same text format from the private registry

## Metric Families

### `ai_gateway_chat_requests_total`

Counter incremented exactly once when each chat request lifecycle finalizes.

| Label | Allowed values |
|---|---|
| `outcome` | `success`, `invalid_request`, `model_rejected`, `rate_limited`, `quota_exhausted`, `state_unavailable`, `upstream_error`, `timeout`, `client_cancelled`, `malformed_upstream`, `internal_error` |

Requests rejected before dispatch still finalize once. A streaming request counts only when its stream completes, fails, or is cancelled—not when response headers start.

### `ai_gateway_chat_requests_in_progress`

Unlabelled gauge incremented on accepted ASGI chat-route entry and decremented in an idempotent finalizer. It includes validation and admission time, and remains elevated for the entire response stream.

### `ai_gateway_chat_request_duration_seconds`

Histogram from chat-route entry until final ASGI body, failure, or cancellation.

| Label | Allowed values |
|---|---|
| `outcome` | Same values as `ai_gateway_chat_requests_total` |

Initial buckets: `0.005`, `0.01`, `0.025`, `0.05`, `0.1`, `0.25`, `0.5`, `1`, `2.5`, `5`, `10`, `30`, `60`, `120`, `300`, `600`, then `+Inf`. Bucket changes require a metrics-schema version review.

### `ai_gateway_upstream_duration_seconds`

Histogram from immediately before upstream send until the upstream response body is fully closed, including streaming lifetime.

| Label | Allowed values |
|---|---|
| `outcome` | `success`, `http_error`, `connect_error`, `timeout`, `client_cancelled`, `malformed_response` |

Uses the same initial buckets as request duration. No observation occurs if the provider dispatch was never attempted.

### `ai_gateway_upstream_failures_total`

Counter for bounded provider/transport failure categories.

| Label | Allowed values |
|---|---|
| `category` | `dns`, `tls`, `connect`, `pool_timeout`, `write_timeout`, `read_timeout`, `total_timeout`, `http_4xx`, `http_5xx`, `invalid_json`, `malformed_sse`, `oversized_response`, `protocol`, `other` |

Raw exception types/messages, status codes, hosts, paths, and provider bodies are never labels.

### `ai_gateway_limit_rejections_total`

Counter incremented once for an authoritative Redis limit denial.

| Label | Allowed values |
|---|---|
| `scope` | `client`, `global` |
| `limit` | `rpm`, `tpm`, `concurrency`, `quota` |

Redis unavailability/inconsistency is not a limit rejection; it produces request outcome `state_unavailable`.

### `ai_gateway_input_tokens_total`

Unlabelled counter. Incremented exactly once by non-negative input usage reported in a trustworthy provider response. It is not incremented from estimates or conservative quota charges.

### `ai_gateway_output_tokens_total`

Unlabelled counter. Incremented exactly once by non-negative output usage reported in a trustworthy provider response. It is not incremented when final stream usage is absent or malformed.

### `ai_gateway_ready`

Unlabelled gauge:

- `1`: startup settings and enforcement marker are valid, the authoritative Redis primary is reachable, scripts are usable, and correct admission decisions can be made.
- `0`: starting, draining, configuration/state mismatch, Redis unavailable/ambiguous, or script/state validation failed.

Provider availability does not change readiness because it is not required to make a correct admission decision and probing it could create traffic or leak detail.

Each readiness request performs a fresh bounded authenticated-primary check of the epoch marker, identity/policy fingerprints, and required scripts. The gauge is updated at startup, drain, every readiness check, and every chat enforcement success/failure. It may be stale only until the next readiness scrape or chat admission; the readiness HTTP response itself never relies only on the cached gauge.

### `ai_gateway_log_events_dropped_total`

Counter incremented when a structured event cannot enter or leave the bounded local logging pipeline.

| Label | Allowed values |
|---|---|
| `reason` | `queue_full`, `sink_error`, `serialization_error` |

## Cardinality Budget

Created-timestamp metrics are disabled before registration. All label sets are initialized at startup so absence is represented by zero. With the v1 bucket and enum sets, the registry contains exactly 57 non-bucket label combinations and at most 363 concrete exported samples including histogram buckets, sums, and counts. A contract test pins the exact parsed family, label, and sample counts. No label accepts a runtime-provided value outside its documented enum.

An internal attempt to observe an unknown enum value is rejected before metric lookup, increments no dynamic series, and emits only the rate-limited constant `metrics_invalid_enum` logging category. It cannot create a new label or make request finalization fail.

Prohibited labels and values include:

- Gateway request/reservation ID
- Raw or pseudonymous client identity
- Raw path, URL, query, method, user agent, origin, or header
- Public or upstream model name, provider name, base URL, or host
- HTTP status code or arbitrary error/exception text
- Prompt, message, tool, response, or structured-output content
- Token cost, remaining quota, or another caller's state

## Exact-Once Rules

One request-scoped finalizer owns:

1. Decrementing `ai_gateway_chat_requests_in_progress`.
2. Incrementing exactly one `ai_gateway_chat_requests_total` outcome.
3. Observing request duration exactly once.
4. Incrementing token counters at most once after trustworthy usage is accepted.
5. Observing upstream duration exactly once if dispatch began.

The finalizer is idempotent and is called from normal response completion, exception handling, stream generator `finally`, disconnect, and shutdown cancellation paths.

## Public Sanitization Tests

Contract tests must scrape after success, invalid input, model mismatch, every enforcement denial, upstream error, timeout, malformed stream, and cancellation, then assert:

- Only documented metric names and label keys exist.
- Every label value belongs to its finite enumeration.
- Canary credentials, URLs, model strings, request IDs, raw/pseudonymous clients, prompt/tool content, error text, and internal addresses are absent.
- Provider-reported input/output usage is counted exactly once; estimated or unknown usage is not presented as measured usage.
- Restart produces valid reset counters without reading any historical gateway store.
- Exact exported sample count includes every bucket, `_sum`, and `_count`, and contains no `_created` samples.
