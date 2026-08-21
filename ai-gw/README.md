# AI Gateway

The repository's authoritative backend is a stateless, single-model OpenAI-compatible FastAPI
gateway. It provides static public model discovery, non-streaming and SSE chat completions,
Redis-backed anonymous usage enforcement, sanitized errors/logging, and separate liveness and
dependency-aware readiness probes.

This directory was imported unchanged in Git history from commit
`147887d23f78865fe718971a2bbd9e787bb54e72` on `feat/ai-gateway-backend`. The integration preserves
that commit and retains the gateway's vendored LiteLLM2-derived reference assets and attribution.

## Deterministic local run

From this directory:

```bash
uv sync --frozen --extra dev
docker compose up --build -d
curl -fsS http://localhost:4000/health/liveness
curl -fsS http://localhost:4000/health/readiness
curl -fsS http://localhost:4000/v1/models
```

Compose starts Redis, runs `gateway-bootstrap` once, starts a deterministic mock OpenAI upstream,
and then starts the gateway. The fixture credentials are local-only and must never be used for a
public environment. The root `../compose.yaml` adds both frontends around this same sequence.

For a native process, copy `.env.example` to `.env`, replace every placeholder with valid values,
point Redis/API base at reachable addresses, then initialize the exact policy fingerprint before
starting the service:

```bash
uv run ai-gateway-bootstrap
uv run ai-gateway
```

The directory-local console entry point defaults to `127.0.0.1:8000`; the root `pnpm dev:gateway`
command and Compose serve port 4000. Public operations are `GET /v1/models`,
`POST /v1/chat/completions`, `GET /health/liveness`, and
`GET /health/readiness`. Swagger is served from vendored assets at `/docs`; metrics are `/metrics`.

## Verification

```bash
uv run ruff check src tests
uv run mypy src
uv run pytest -q
```

With Redis published by either Compose file:

```bash
TEST_REDIS_URL=redis://127.0.0.1:6389/0 uv run pytest \
  tests/integration/test_rate_limiter_toctou.py \
  tests/integration/test_multi_instance_atomicity.py \
  tests/integration/test_reservation_reconciliation.py \
  tests/integration/test_readiness_failure_modes.py -q
```

## Operator contract

- Run bootstrap once after any enforcement policy, identity secret, deployment ID, or epoch change.
- Use a persistent Redis volume. Marker mismatch, script loss, inconsistency, or Redis outage makes
  readiness return 503 and prevents unmetered admission.
- Upstream-provider availability is deliberately excluded from readiness and fails per request.
- Set exact CORS origins and operator-owned trusted ingress CIDRs; never trust arbitrary forwarded
  addresses.
- Supply the provider URL, protected model, provider key, and random identity secret only at runtime.
- Build and deploy `../deploy/compose.gateway.yaml` for the independent production boundary; it has
  no fixture secrets or mock provider.

See [configuration](docs/configuration.md), [OpenAI compatibility](docs/openai-compatibility.md),
[anonymous enforcement](docs/anonymous-enforcement.md), and [observability](docs/observability.md).
Repository-level provenance and deployment ownership are documented in
[`../docs/architecture/ai-gateway-upstream.md`](../docs/architecture/ai-gateway-upstream.md).
