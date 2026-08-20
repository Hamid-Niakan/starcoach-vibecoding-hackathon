# AI Gateway

A single-model OpenAI-compatible chat gateway with static model discovery, self-hosted Swagger, Redis-backed anonymous limits, public sanitized Prometheus metrics, and bounded JSON logging.

```bash
uv sync --frozen --extra dev
cp .env.example .env
# Replace all example secrets, then initialize the chosen deployment epoch:
uv run ai-gateway-bootstrap
uv run ai-gateway
```

The API is served at `http://127.0.0.1:8000` for the console entry point and port `4000` in Docker Compose. Point an OpenAI-compatible frontend at `/v1`; `GET /v1/models` supplies its single static model choice. Swagger is `/docs`, health is under `/health`, and metrics are `/metrics`.

Verification:

```bash
uv run ruff check src tests
uv run mypy src
uv run pytest -q
```

Release gates used by the implementation (with the Compose Redis published on `127.0.0.1:6389`) are:

```bash
uv sync --frozen --extra dev
TEST_REDIS_URL=redis://127.0.0.1:6389/0 uv run pytest \
  tests/integration/test_rate_limiter_toctou.py \
  tests/integration/test_multi_instance_atomicity.py \
  tests/integration/test_reservation_reconciliation.py \
  tests/integration/test_readiness_failure_modes.py -q
RUN_PERFORMANCE=1 TEST_REDIS_URL=redis://127.0.0.1:6389/0 \
  uv run pytest tests/performance -m performance -q
RUN_LONG_TESTS=1 TEST_REDIS_URL=redis://127.0.0.1:6389/0 \
  uv run pytest tests/integration/test_reservation_reconciliation.py -m long_running -q
docker compose build gateway
```

See [configuration](docs/configuration.md), [OpenAI compatibility](docs/openai-compatibility.md), [anonymous enforcement](docs/anonymous-enforcement.md), and [observability](docs/observability.md). The complete operator flow is in `../specs/003-simplify-gateway-operations/quickstart.md`.
