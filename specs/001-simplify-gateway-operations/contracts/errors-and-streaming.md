# Error, Streaming, and Response-Security Contract

**Schema version**: `v1`
**Applies to**: Every public route and the OpenAI-compatible chat stream

## Error Mapping

Every JSON error uses `ErrorResponse` from [openapi.yaml](./openapi.yaml), includes a gateway-generated `X-Request-ID`, and contains no raw provider body/header, credential, address, model identifier, path, exception, or stack trace.

| Condition | HTTP | `error.type` | `error.code` | Retry |
|---|---:|---|---|---|
| Invalid JSON, schema, cross-field rule, path, or model alias | 400 | `invalid_request_error` | Bounded local validation code | No automatic retry |
| Body, count, decoded-content, or nesting limit | 413 | `invalid_request_error` | `payload_too_large` | Reduce request |
| Content type or content encoding not accepted | 415 | `invalid_request_error` | `unsupported_media_type` | Correct request |
| Local RPM, TPM, concurrency, or quota denial | 429 | `rate_limit_error` or `quota_exceeded_error` | `rate_limit_exceeded` or `quota_exhausted` | Mandatory bounded `Retry-After` |
| Provider returns 429 | 429 | `upstream_error` | `upstream_rate_limited` | Locally bounded `Retry-After`; no upstream details |
| Unexpected gateway failure | 500 | `internal_error` | `internal_error` | Retry may succeed |
| Provider 400/404/409/422 or other safe request rejection | 502 | `upstream_error` | `upstream_rejected` | Inspect request/provider compatibility |
| Provider 401/403 | 502 | `upstream_error` | `upstream_authentication_failed` | Operator action; never challenge caller |
| DNS, TLS, connect, protocol, malformed JSON/SSE, oversized provider response, or provider 5xx | 502 | `upstream_error` | `upstream_unavailable` | Retry may succeed |
| Enforcement unavailable, ambiguous, or inconsistent | 503 | `service_unavailable_error` | `enforcement_unavailable` | Mandatory bounded `Retry-After`; no provider call |
| Provider read/write/pool or total request/stream timeout | 504 | `timeout_error` | `upstream_timeout` | Retry may succeed |

Unknown routes return sanitized `404`; unsupported methods return sanitized `405` with no route enumeration. Both receive the response-security headers below. Framework-native `422` bodies are never exposed.

The gateway never relays provider `WWW-Authenticate`, `Set-Cookie`, `Location`, CORS, server, request-ID, organization/project, rate-limit detail, or arbitrary headers. Provider retry hints are parsed only when valid and clamped to the gateway's documented maximum; otherwise the gateway supplies its own bounded value.

## SSE Wire Contract

Successful streaming uses UTF-8 `text/event-stream`. One logical event is delimited by a blank line and may arrive across arbitrary transport chunks. The parser:

- Accepts LF or CRLF delimiters and ignores comment lines beginning with `:`.
- Joins multiple `data:` lines with a newline as required by SSE.
- Ignores bounded unknown SSE fields but never forwards them as headers or metadata.
- Bounds each complete event, the incomplete-event buffer, cumulative stream bytes, event count, read inactivity, and total lifetime using [configuration.md](./configuration.md).
- Requires each non-terminator data payload to be either a valid `ChatCompletionChunk` or the bounded sanitized error envelope below.
- Rewrites every exposed model field to the configured public alias.
- Accepts a usage-only final chunk with empty choices and trustworthy usage.
- Emits at most one `data: [DONE]` terminator. Duplicate upstream terminators are not forwarded.

### Commitment and failure behavior

| Event | Public behavior | Enforcement/metrics behavior |
|---|---|---|
| Non-2xx provider response before commitment | Return mapped JSON error with mapped HTTP status | Keep conservative reservation; one failure outcome |
| Invalid first event or provider error before commitment | Return mapped JSON error | Keep conservative reservation; no measured tokens |
| Valid first chunk | Commit public `200` SSE response | Request remains in progress |
| Provider error, malformed event, limit overflow, timeout, or premature EOF after commitment | If writable, emit one `data: {"error": <ErrorResponse.error>}` event then one `[DONE]`; otherwise close | Keep conservative reservation unless trustworthy final usage was already accepted; one bounded failure outcome |
| Normal upstream `[DONE]` | Emit one `[DONE]` and close | Reconcile trustworthy usage once; success outcome |
| Upstream closes cleanly without `[DONE]` | Treat as malformed, not success | Conservative charge and malformed outcome |
| Client disconnect/send cancellation | Write neither error nor `[DONE]`; close provider promptly | Conservative charge unless trustworthy usage was already accepted; `client_cancelled` outcome |
| Usage appears more than once | Accept the single final trustworthy value only when internally consistent; otherwise malformed | Never double-count or double-reconcile |

The post-commit error payload has this shape inside the SSE `data:` value:

```json
{"error":{"message":"The stream could not be completed.","type":"upstream_error","param":null,"code":"upstream_unavailable"}}
```

Messages and codes are selected from fixed tables. No partial provider error text is copied.

## Exact Response Headers

All responses, including `404`, `405`, `413`, validation errors, unhandled failures, docs, static assets, metrics, health, JSON chat, and stream start, receive:

- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Content-Security-Policy: frame-ancestors 'none'` at minimum; Swagger HTML uses a stricter self-hosted-asset policy with a per-response nonce or pinned hashes for its bootstrap code
- `Referrer-Policy: no-referrer`
- `Permissions-Policy` disabling camera, microphone, geolocation, payment, USB, and other unused browser capabilities
- `Cache-Control: no-store`; streaming uses `no-cache, no-store`

`Strict-Transport-Security: max-age=31536000; includeSubDomains` appears only when `AI_GATEWAY_ENABLE_HSTS=true` and startup has an authoritative HTTPS trust boundary. It is never inferred from an untrusted `X-Forwarded-Proto` value.

JSON API operations and JSON errors include a gateway-generated `X-Request-ID`. Streaming responses include it on the initial response. Static assets and the metrics text body need not create request-level diagnostic events. CORS headers appear only for an exact configured origin and never use a credentialed wildcard.

## Validation Cases

- Errors before and after SSE commitment
- Fragmented, multiline, CRLF, commented, duplicate-terminator, missing-terminator, usage-only, malformed, oversized, overlong, and cancelled streams
- Every error-table row, including provider 401/403 and 429 sanitization
- No unsafe provider response header survives
- Every route and framework-generated failure has the exact security/cache policy
- Swagger CSP loads only local integrity-recorded assets and makes no external request
