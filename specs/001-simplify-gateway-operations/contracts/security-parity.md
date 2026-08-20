# Gateway Security Control Contract

**Target**: `ai-gw/` chat, anonymous identity, enforcement, forwarding, response, documentation, health, metrics, and logging paths

This inventory is the release gate for the gateway's retained security properties. Controls may be added but may be removed only when the protected feature is removed or an equally protective replacement is documented. Each applicable row must link to passing local evidence before release.

| Control / threat | Required behavior | Required `ai-gw` evidence | Status |
|---|---|---|---|
| Trusted client-address boundary | Strict bounded forwarding-chain parsing, trusted direct peers only, canonical addresses, and deployment-keyed pseudonyms | `tests/unit/auth/test_network.py`, `tests/unit/auth/test_anonymous_identity.py` | Implemented |
| Request body exhaustion | Reject ambiguous framing, compression, oversized bodies, excess nesting, and excess element counts before application handling | `tests/unit/middleware/test_request_size_limit_middleware.py` | Implemented |
| Framing, sniffing, caching, and HSTS | Apply safe security headers to every response; advertise HSTS only behind authoritative HTTPS | `tests/unit/middleware/test_security_headers_middleware.py` | Implemented |
| Public metrics disclosure | Use a private fixed registry, bounded labels, zero caller/content dimensions, fixed exposition, and ingress limits | `tests/contract/test_metrics_contract.py`, `tests/security/test_public_surface_sanitization.py` | Implemented; public surface approved |
| Unsafe destination and DNS rebinding | Validate every resolved address, reject prohibited networks, disable redirects and environment proxies, and re-check destinations | `tests/security/test_destination_lock.py` | Implemented |
| Request-supplied destination | Forbid caller routing fields and keep the destination immutable | `tests/security/test_destination_lock.py`, `tests/unit/proxy/test_proxy_types.py` | Implemented |
| Header and credential forwarding | Forward zero caller headers and construct only required provider headers locally | `tests/security/test_header_spoofing.py` | Implemented |
| Rate-limit race conditions | Make client and global admission one atomic state transition | `tests/integration/test_rate_limiter_toctou.py`, `tests/integration/test_multi_instance_atomicity.py` | Implemented |
| Local limiter fallback | Fail closed on every authoritative-state error before provider dispatch; never fall back locally | `tests/integration/test_readiness_failure_modes.py` | Implemented |
| Reservation and reconciliation atomicity | Use token-only conservative reservation and idempotent exact-once reconciliation without spend history | `tests/integration/test_reservation_reconciliation.py` | Implemented |
| Secret and error redaction | Apply event allowlists and top-level exception sanitization across gateway logging | `tests/unit/observability/test_logging_redaction.py`, `tests/contract/test_logging_contract.py` | Implemented |
| Upstream error-header stripping | Construct public error headers locally from a fixed set | `tests/contract/test_error_contract.py` | Implemented |
| Response model sanitization | Replace the protected upstream model with the public alias in JSON and every stream event | `tests/contract/test_routes_chat_completions.py`, `tests/integration/test_streaming_and_disconnect.py` | Implemented |
| Exception response sanitization | Normalize validation and unhandled failures without exposing internals, including the pre/post stream-commit split | `tests/contract/test_error_contract.py` | Implemented |
| API-description sanitization | Publish only the fixed chat/model/health contract with local Swagger assets and safe examples | `tests/contract/test_openapi_schema.py`, `tests/contract/test_swagger_assets.py` | Implemented |
| Browser cross-origin access | Deny by default; allow only exact configured origins and never wildcard credentials | security header and public-surface tests | Implemented |
| Sensitive management routes | Keep management, detailed usage, authentication administration, and diagnostics routes absent | `tests/contract/test_public_route_inventory.py` | Implemented by absence |
| Route and static-asset attack surface | Maintain a fixed route inventory and only self-hosted Swagger assets | `tests/security/test_removed_routes_and_artifacts.py` | Implemented |

## Additional Controls

- Every enforcement key includes deployment and policy-epoch identity plus a canonical policy fingerprint.
- Remote image URLs and provider file IDs are rejected; supported multimodal data is inline only.
- Upstream headers, decoded JSON, stream event/buffer/total bytes, event count, inactivity, and total lifetime are bounded.
- Access-log noise is disabled and every dependency/framework log path is constrained by the structured-logging contract.
- Public Swagger has no OAuth redirect, CDN dependency, or external favicon and uses a strict content-security policy compatible with pinned local assets.
- Readiness performs live authenticated marker/script validation and cannot silently fall back to local enforcement.

## Release Gate

The security gate passes only when every applicable row links to passing local evidence. Any exclusion or public-surface deviation requires an explicit rationale, compensating controls, and regression coverage.
