# Configuration

The gateway reads immutable scalar `AI_GATEWAY_*` variables once at process startup. Unknown variables in that namespace are rejected. Changes require a restart and enforcement-policy changes require a deliberate new epoch plus bootstrap.

## Required destination and state

| Variable                            | Meaning                                                                                      |
| ----------------------------------- | -------------------------------------------------------------------------------------------- |
| `AI_GATEWAY_MODEL_NAME`             | Public model alias returned by `/v1/models` and accepted by chat.                            |
| `AI_GATEWAY_MODEL`                  | Protected upstream model identifier.                                                         |
| `AI_GATEWAY_API_BASE`               | Fixed OpenAI-compatible API prefix; HTTPS unless the local-development exception is enabled. |
| `AI_GATEWAY_API_KEY`                | Provider bearer credential. Never emitted or forwarded from callers.                         |
| `AI_GATEWAY_REDIS_URL`              | Authoritative Redis primary. There is no local fallback.                                     |
| `AI_GATEWAY_DEPLOYMENT_ID`          | Stable enforcement namespace.                                                                |
| `AI_GATEWAY_ENFORCEMENT_EPOCH`      | Explicit policy/identity epoch. Change it for incompatible enforcement changes.              |
| `AI_GATEWAY_IDENTITY_SECRET`        | At least 32 random bytes used as the HMAC key for anonymous client identity.                 |
| `AI_GATEWAY_MODEL_MAX_INPUT_TOKENS` | Provider-verified worst-case input bound reserved for every admitted request.                |

The four destination values are singular. Lists, commas, routing/fallback variables, empty values, and placeholders are invalid. URLs with userinfo, query strings, or fragments are invalid. `AI_GATEWAY_ALLOW_INSECURE_LOCAL_UPSTREAM=true` permits HTTP only for local/private fixture hosts; `AI_GATEWAY_ALLOW_PRIVATE_UPSTREAM=true` documents that development exception. Production must additionally enforce destination egress policy.

## Enforcement

Client settings are `AI_GATEWAY_CLIENT_RPM`, `AI_GATEWAY_CLIENT_TPM`, `AI_GATEWAY_CLIENT_MAX_CONCURRENCY`, `AI_GATEWAY_CLIENT_QUOTA_TOKENS`, and `AI_GATEWAY_CLIENT_QUOTA_WINDOW_SECONDS`. The matching global variables begin `AI_GATEWAY_GLOBAL_`. All values are positive integers. Quota windows must exceed maximum stream lifetime plus reconciliation grace.

Request bounds are `AI_GATEWAY_MAX_BODY_BYTES`, `AI_GATEWAY_MAX_JSON_DEPTH`, `AI_GATEWAY_MAX_MESSAGES`, `AI_GATEWAY_MAX_TOOLS`, `AI_GATEWAY_MAX_OUTPUT_TOKENS`, `AI_GATEWAY_MAX_REQUEST_SECONDS`, `AI_GATEWAY_MAX_STREAM_SECONDS`, `AI_GATEWAY_RECONCILIATION_GRACE_SECONDS`, `AI_GATEWAY_MAX_RESPONSE_BYTES`, `AI_GATEWAY_MAX_SSE_EVENT_BYTES`, `AI_GATEWAY_MAX_SSE_BUFFER_BYTES`, `AI_GATEWAY_MAX_STREAM_BYTES`, and `AI_GATEWAY_MAX_STREAM_EVENTS`.

`MAX_REQUEST_SECONDS` is an absolute wall-clock budget for the complete non-streaming lifecycle, including admission, connection, response reading, validation, and reconciliation. `MAX_STREAM_SECONDS` begins before admission and bounds the complete streaming lifecycle; bytes arriving periodically do not extend it. The per-operation HTTP timeouts below remain defense in depth and do not replace these total deadlines.

Run `ai-gateway-bootstrap` after validating a new deployment/epoch and before starting traffic. Bootstrap is idempotent for an identical fingerprint and rejects a conflicting fingerprint.

## Transport and operations

HTTP timeouts use `AI_GATEWAY_CONNECT_TIMEOUT_SECONDS`, `READ_TIMEOUT_SECONDS`, `WRITE_TIMEOUT_SECONDS`, and `POOL_TIMEOUT_SECONDS`. Pool settings are `MAX_CONNECTIONS` and `MAX_KEEPALIVE_CONNECTIONS`; Redis operations use `REDIS_TIMEOUT_SECONDS`. Prefix each short name with `AI_GATEWAY_`.

`AI_GATEWAY_TRUSTED_PROXY_CIDRS` and `AI_GATEWAY_CORS_ALLOW_ORIGINS` are comma-separated scalar strings whose entries are individually validated. Keep trusted proxy CIDRs empty for direct local access. Behind an ingress, set only the smallest operator-owned ingress CIDR set and set `AI_GATEWAY_MAX_FORWARDED_HOPS` to the known chain length; never trust all private networks. An empty trust set behind ingress is safe from spoofing but makes visitors share the ingress identity and limits.

Each CORS origin must be an exact `http` or `https` origin without a path, wildcard, credentials, query, or fragment. Allowed browser origins may use `GET`, `POST`, and `OPTIONS`, request `content-type` and optional `authorization`, and read `x-request-id`. Requests without `Origin` bypass CORS processing for CLI and SDK compatibility.

Logging uses `AI_GATEWAY_LOG_LEVEL` and `AI_GATEWAY_LOG_QUEUE_CAPACITY`. Secrets should come from the orchestrator's secret facility, never image layers or committed `.env` files.
