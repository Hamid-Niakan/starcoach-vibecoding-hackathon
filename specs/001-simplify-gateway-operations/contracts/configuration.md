# Configuration Contract

**Version**: `v1`
**Activation**: Process startup only
**Source**: Scalar environment variables and platform secret injection

The gateway has no configuration file, multi-model routing list, reload watcher, management endpoint, or database-backed settings. Values are parsed together into one frozen settings graph. Any invalid value prevents readiness and exits startup with a bounded error category; secret values are never included in the message. The public `GET /v1/models` response is derived from this graph and is not a configuration source.

## Required Destination and State Variables

| Variable | Secret | Type | Example | Rules |
|---|---:|---|---|---|
| `AI_GATEWAY_MODEL_NAME` | No | string | `liara-chat` | Required public alias, exact caller match, and exact `GET /v1/models` entry ID; 1–128 visible ASCII characters; not a URL/list/provider prefix |
| `AI_GATEWAY_MODEL` | No | string | `provider-model-id` | Required fixed identifier sent to the OpenAI-compatible provider; 1–256 characters; never exposed publicly |
| `AI_GATEWAY_API_BASE` | No | URL | `https://provider.example/v1` | Required fixed API prefix; no userinfo/query/fragment; HTTPS unless the local-development exception applies |
| `AI_GATEWAY_API_KEY` | Yes | string | injected secret | Required non-placeholder bearer credential; minimum 16 characters |
| `AI_GATEWAY_REDIS_URL` | Yes | Redis URL | injected secret | Required primary endpoint; `rediss://` with authentication and certificate verification outside the explicit local validation network; no replica-read mode |
| `AI_GATEWAY_DEPLOYMENT_ID` | No | string | `starcoach-prod` | Required stable key namespace; 3–64 lowercase letters, digits, or hyphens |
| `AI_GATEWAY_ENFORCEMENT_EPOCH` | No | string | `2026-08-v1` | Required stable policy/identity epoch; 3–64 lowercase letters, digits, or hyphens; changing it creates a deliberately separate hash-tagged allowance space |
| `AI_GATEWAY_IDENTITY_SECRET` | Yes | base64url | injected secret | Required deployment-wide HMAC key that decodes to exactly 32 random bytes; padding is optional; known placeholders and repeated-byte values are rejected |

`AI_GATEWAY_API_BASE` identifies a prefix, not the final operation. The gateway appends exactly `/chat/completions` after normalizing one slash. The public request cannot supply or override any URL component.

At runtime these four scalars form one immutable destination configuration containing the public alias, upstream model, fixed API base, and secret API key. The `AI_GATEWAY_` prefix identifies this service and is not a claim of drop-in environment compatibility with another gateway.

## Anonymous Enforcement Policy

All values are positive base-10 integers and have documented implementation maxima below Redis signed-integer and Lua exact-integer boundaries. Startup proves that one worst-case reservation fits client and global TPM/quota limits. The first-release quota unit is tokens; cost quota/pricing fields do not exist.

RPM and concurrency values are capped at `1,000,000`; messages at `128`; tools at `32`; choices at `8`; input/output/TPM values at `2,147,483,647`; quota values and every derived counter at `9,007,199,254,740,991`; and quota windows at `31,536,000` seconds. Startup rejects any multiplication or addition that could exceed those bounds. Runtime OpenAPI may substitute a configured lower message/tool/choice/output ceiling but never advertises a value above the frozen baseline in `openapi.yaml`.

| Variable | Default | Meaning |
|---|---:|---|
| `AI_GATEWAY_CLIENT_RPM` | `60` | Requests admitted per anonymous client per fixed 60-second window |
| `AI_GATEWAY_CLIENT_TPM` | `100000` | Reserved/reconciled tokens per client per fixed 60-second window |
| `AI_GATEWAY_CLIENT_MAX_CONCURRENCY` | `4` | Active client leases |
| `AI_GATEWAY_CLIENT_QUOTA_TOKENS` | `1000000` | Client tokens per quota window |
| `AI_GATEWAY_CLIENT_QUOTA_WINDOW_SECONDS` | `86400` | Client quota window length |
| `AI_GATEWAY_GLOBAL_RPM` | `600` | Requests admitted gateway-wide per fixed 60-second window |
| `AI_GATEWAY_GLOBAL_TPM` | `1000000` | Reserved/reconciled tokens gateway-wide per fixed 60-second window |
| `AI_GATEWAY_GLOBAL_MAX_CONCURRENCY` | `64` | Active global leases |
| `AI_GATEWAY_GLOBAL_QUOTA_TOKENS` | `10000000` | Gateway-wide tokens per quota window |
| `AI_GATEWAY_GLOBAL_QUOTA_WINDOW_SECONDS` | `86400` | Global quota window length |

Global limits must be at least one valid request/concurrency slot. A global value may be lower than the theoretical sum of all clients because it is a safety ceiling. Quota-window lengths must exceed the maximum stream lifetime plus reconciliation grace.

## Request and Upstream Safety

| Variable | Default | Rules |
|---|---:|---|
| `AI_GATEWAY_MAX_BODY_BYTES` | `1048576` | Enforced from `Content-Length` and while consuming the ASGI body |
| `AI_GATEWAY_MAX_INBOUND_HEADER_BYTES` | `32768` | Maximum aggregate decoded name/value bytes visible at the ASGI boundary; ingress/server limit must be equal or lower |
| `AI_GATEWAY_MAX_INBOUND_HEADER_COUNT` | `100` | Maximum inbound header fields, counting duplicates before semantic validation |
| `AI_GATEWAY_MAX_JSON_DEPTH` | `32` | Reject deeper documents before upstream dispatch |
| `AI_GATEWAY_MAX_MESSAGES` | `128` | Maximum chat messages |
| `AI_GATEWAY_MAX_TOOLS` | `32` | Maximum tool declarations |
| `AI_GATEWAY_MAX_INPUT_TOKENS` | required | Operator-verified upper bound on provider-reported input tokens for every accepted request; the full value is reserved before dispatch |
| `AI_GATEWAY_MAX_OUTPUT_TOKENS` | `4096` | Operator ceiling and default reservation when caller omits an output maximum |
| `AI_GATEWAY_MAX_CHOICES` | `8` | Maximum accepted `n`; output reservation is `n ×` the effective output ceiling |
| `AI_GATEWAY_MAX_REQUEST_SECONDS` | `120` | Non-streaming total lifetime ceiling |
| `AI_GATEWAY_MAX_STREAM_SECONDS` | `600` | Streaming total lifetime and concurrency-lease basis |
| `AI_GATEWAY_RECONCILIATION_GRACE_SECONDS` | `30` | Added to leases/window TTLs; must be less than quota windows |
| `AI_GATEWAY_UPSTREAM_CONNECT_TIMEOUT_SECONDS` | `5` | HTTPX connect timeout |
| `AI_GATEWAY_UPSTREAM_READ_TIMEOUT_SECONDS` | `60` | Maximum silence between upstream response chunks; total lifetime remains separately bounded |
| `AI_GATEWAY_UPSTREAM_WRITE_TIMEOUT_SECONDS` | `10` | HTTPX request-body write timeout |
| `AI_GATEWAY_UPSTREAM_POOL_TIMEOUT_SECONDS` | `5` | HTTPX pool acquisition timeout |
| `AI_GATEWAY_UPSTREAM_MAX_CONNECTIONS` | `100` | Per-process pool ceiling |
| `AI_GATEWAY_UPSTREAM_MAX_KEEPALIVE` | `20` | Per-process idle keep-alive ceiling |
| `AI_GATEWAY_MAX_UPSTREAM_HEADER_BYTES` | `32768` | Maximum aggregate upstream response-header bytes |
| `AI_GATEWAY_MAX_UPSTREAM_JSON_BYTES` | `8388608` | Maximum decoded non-streaming success/error body bytes |
| `AI_GATEWAY_MAX_SSE_EVENT_BYTES` | `1048576` | Maximum one complete SSE event and incomplete-event buffer |
| `AI_GATEWAY_MAX_STREAM_BYTES` | `33554432` | Maximum cumulative upstream stream bytes before conservative termination |
| `AI_GATEWAY_MAX_STREAM_EVENTS` | `100000` | Maximum parsed upstream events before conservative termination |
| `AI_GATEWAY_MAX_XFF_BYTES` | `2048` | Maximum accepted `X-Forwarded-For` bytes when the direct peer is trusted |
| `AI_GATEWAY_MAX_XFF_HOPS` | `16` | Maximum accepted forwarding hops |

The gateway disables HTTP redirects, response compression, and `trust_env` proxy inheritance unconditionally. It sends `Accept-Encoding: identity`, rejects unexpected upstream `Content-Encoding`, and rejects over-limit headers, ambiguous inbound framing, unsupported request content encoding, malformed or duplicate `Content-Length`, and transfer-encoding/content-length conflicts visible at the ASGI boundary. These switches are not configurable.

Startup validates the provider scheme, hostname, port, normalized path, and every current A/AAAA result. Production rejects loopback, private, link-local, multicast, unspecified, reserved, IPv4-mapped, and cloud-metadata ranges and requires an egress control that preserves those denials on later DNS resolutions. TLS uses hostname/SNI verification with the system or explicitly mounted CA trust; `verify=false` is not supported.

The gateway forwards no caller header. It creates only `Authorization: Bearer <operator key>`, `Content-Type: application/json`, `Accept` for the selected response mode, `Accept-Encoding: identity`, and a fixed `User-Agent`. It never forwards caller authorization, cookies, host, forwarding, request-ID, tracing, organization/project/beta, quota, or arbitrary `X-*` headers. Responses likewise reconstruct only the contracted content type, cache/security headers, generated request ID, `X-Accel-Buffering` for streams, and bounded `Retry-After`; upstream cookies, location, authentication challenges, server/provider identifiers, CORS, and detailed rate headers are never relayed.

## Network Trust and Browser Policy

| Variable | Default | Rules |
|---|---|---|
| `AI_GATEWAY_TRUSTED_PROXY_CIDRS` | empty | Comma-separated canonical CIDRs; forwarding headers are ignored unless the direct peer matches |
| `AI_GATEWAY_CORS_ALLOWED_ORIGINS` | empty | Comma-separated exact origins; empty denies cross-origin browser chat; wildcard is invalid |
| `AI_GATEWAY_ENABLE_HSTS` | `false` | May be true only when the public origin is authoritatively HTTPS at the process or trusted ingress; never inferred from an untrusted forwarding header |
| `AI_GATEWAY_ALLOW_INSECURE_LOCAL_UPSTREAM` | `false` | Works only together with `AI_GATEWAY_ALLOW_PRIVATE_UPSTREAM`; permits HTTP for declared loopback/private fixture destinations in local validation |
| `AI_GATEWAY_ALLOW_PRIVATE_UPSTREAM` | `false` | Works only together with the insecure-local flag; permits declared loopback/private fixture destinations but never link-local, metadata, multicast, unspecified, reserved, or mapped metadata targets |

Only `X-Forwarded-For` is recognized, and only when the direct peer is in the trusted CIDRs. `Forwarded`, `X-Real-IP`, and vendor headers never affect identity. Duplicate, empty, malformed, zone-qualified, overlong, or over-deep chains are rejected for chat; if every valid hop is trusted, the direct peer is used. A missing peer rejects chat.

The Swagger page, OpenAPI schema, static one-model list, metrics, and health endpoints are public without credentials. This does not enable permissive CORS; same-origin Swagger works without it. Production deployment must impose bounded connection/request controls on these public non-chat routes and an outbound egress policy that blocks private and metadata destinations after every DNS resolution.

## Redis and Logging Controls

| Variable | Default | Rules |
|---|---:|---|
| `AI_GATEWAY_REDIS_CONNECT_TIMEOUT_SECONDS` | `2` | Finite positive number |
| `AI_GATEWAY_REDIS_OPERATION_TIMEOUT_SECONDS` | `1` | Finite positive number; ambiguity fails closed |
| `AI_GATEWAY_LOG_LEVEL` | `INFO` | `DEBUG`, `INFO`, `WARNING`, or `ERROR`; production DEBUG still cannot include prohibited fields |
| `AI_GATEWAY_LOG_QUEUE_CAPACITY` | `8192` | Positive bounded integer; drop-new behavior when full |

Metric names, labels, histogram buckets, log fields, and event names are versioned code contracts, not runtime configuration. No variables enable tracing, stored statistics, remote metric push, remote log delivery, content logging, UI, provider lists, retries, fallback, or dynamic routes.

## Enforcement Bootstrap Contract

The gateway process never silently creates missing deployment metadata. Before the first gateway start, run the idempotent operator command:

```bash
uv run python -m ai_gateway.proxy.enforcement.bootstrap
```

The command uses the same settings, authenticates to the authoritative Redis primary, and performs an atomic create-if-absent of:

- Contract version
- Deployment ID
- Enforcement epoch
- A non-reversible fingerprint of the identity secret
- Identity algorithm version
- A canonical fingerprint of both policies, maximum input/output/choice reservation bounds, request/stream lifetime, reconciliation grace, and all admission/window/key semantics

The marker and every operational key use `{deployment_id:enforcement_epoch}` as their Redis hash tag. If that epoch's marker already matches, bootstrap succeeds without mutation. If any field differs, it exits non-zero and does not overwrite state. A new validated epoch can be initialized alongside the old epoch; enforcement-relevant changes require draining or atomically switching traffic so callers cannot consume both spaces. Normal gateway startup and every admission require an exact marker match. A missing marker after prior initialization is treated as possible state loss and keeps readiness false until the operator deliberately bootstraps a new epoch.

## Rejected Configuration Shapes

Startup fails if any destination field contains a JSON/YAML list or mapping, more than one URL/model/key is supplied, comma-separated model aliases appear, an obsolete model-list/provider/fallback variable is used, or any unknown `AI_GATEWAY_*` variable could plausibly change routing/security behavior.

Examples that must fail:

```text
AI_GATEWAY_MODEL_NAME=["a","b"]
AI_GATEWAY_API_BASE=https://one.example/v1,https://two.example/v1
AI_GATEWAY_MODEL={"primary":"a","fallback":"b"}
AI_GATEWAY_FALLBACK_MODEL=another-model
AI_GATEWAY_PROVIDER_LIST=...
```

## Secret Handling

- `.env.example` contains names and non-secret placeholders only.
- Real `.env` files and platform secret files are excluded from version control and image layers.
- Pydantic secret fields render as redacted values.
- Startup validation reports only variable name plus bounded error category.
- No settings dump, debug endpoint, Swagger example, metric label, health body, or log event contains secret values, upstream addresses, or Redis addresses.
