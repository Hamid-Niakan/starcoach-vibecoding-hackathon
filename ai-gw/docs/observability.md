# Observability

`GET /metrics` exposes a private Prometheus registry only. It contains chat outcomes/in-progress/duration, full upstream duration/failure, limit rejection, trustworthy input/output tokens, readiness, and dropped-log counters. Labels are closed enums; request/client IDs, model/provider values, paths, errors, and content are never labels. Counters are process-local and reset on restart; Prometheus owns retention and aggregation.

Application logs are UTF-8 JSON Lines written to stdout through a bounded non-blocking local queue. A schema-first allowlist retains only documented typed fields. One canonical `request.completed` event correlates with the gateway-generated `x-request-id` while the sink is healthy. Bodies, messages, tool data, headers, secrets, raw IPs, URLs, upstream identifiers/errors, and stack traces are prohibited.

When the queue or sink degrades, the gateway drops new events instead of blocking chat. `ai_gateway_log_events_dropped_total` records `queue_full`, `sink_error`, or `serialization_error`; a rate-limited constant stderr notice contains no request data. External log infrastructure owns delivery and retention. The gateway has no tracing, spans, exemplars, UI, or stored analytics.

Liveness reports process life only. Invalid immutable configuration prevents startup. After startup, readiness performs a live Redis connectivity, marker, consistency, and script check and reports only `ready` or `not_ready`; no dependency names or timings are exposed. Readiness deliberately does not probe the upstream provider, because probes can create cost and restart loops and cannot guarantee the next request. Provider DNS, transport, HTTP, malformed-response, and absolute-deadline failures are sanitized per request while readiness remains healthy.

Non-streaming total-deadline expiry is recorded as a timeout and returns a pre-stream 504 envelope. Once streaming headers are committed, total-deadline expiry or malformed upstream data closes the stream without `[DONE]`; request duration and a closed failure category are recorded without payloads. The public `x-request-id` is available to configured browser origins for support correlation.
