# Observability

`GET /metrics` exposes a private Prometheus registry only. It contains chat outcomes/in-progress/duration, full upstream duration/failure, limit rejection, trustworthy input/output tokens, readiness, and dropped-log counters. Labels are closed enums; request/client IDs, model/provider values, paths, errors, and content are never labels. Counters are process-local and reset on restart; Prometheus owns retention and aggregation.

Application logs are UTF-8 JSON Lines written to stdout through a bounded non-blocking local queue. A schema-first allowlist retains only documented typed fields. One canonical `request.completed` event correlates with the gateway-generated `x-request-id` while the sink is healthy. Bodies, messages, tool data, headers, secrets, raw IPs, URLs, upstream identifiers/errors, and stack traces are prohibited.

When the queue or sink degrades, the gateway drops new events instead of blocking chat. `ai_gateway_log_events_dropped_total` records `queue_full`, `sink_error`, or `serialization_error`; a rate-limited constant stderr notice contains no request data. External log infrastructure owns delivery and retention. The gateway has no tracing, spans, exemplars, UI, or stored analytics.

Liveness reports process life only. Readiness performs a live Redis marker/script check and reports only `ready` or `not_ready`; no dependency names or timings are exposed.
