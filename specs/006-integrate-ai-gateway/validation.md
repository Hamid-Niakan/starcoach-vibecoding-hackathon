# Feature 006 Validation Evidence

## User Story 2 — Authoritative Backend

Validated on 2026-08-21 from the integration working tree:

- `uv --directory ai-gw run --frozen ruff check src tests` — passed.
- `uv --directory ai-gw run --frozen mypy src` — passed with 45 source files checked.
- `uv --directory ai-gw run --frozen pytest -q` — 88 passed; 18 explicit Redis,
  performance, or longevity gates skipped because their opt-in runtime was not available.
- `pnpm test:ops` — 7 tests passed, including authoritative-backend, Compose inventory,
  integration ancestry, and ZarinPal boundary guards.
- `pnpm build:gateway` — passed using the locked environment and Python bytecode compilation.
- `docker compose config --quiet` — root deterministic stack definition passed.
- `docker compose -f ai-gw/compose.yaml config --quiet` — standalone local gateway definition passed.
- `docker compose -f deploy/compose.gateway.yaml config --quiet` with all required operator values —
  production overlay passed.
- Repository inspection found no active `apps/api` package, `deploy/compose.api.yaml`, NestJS,
  Drizzle, PostgreSQL, or DuckDB dependency in workspace manifests or the pnpm lockfile.

### Runtime evidence still required

Container build and live HTTP smoke tests could not run in this execution environment: direct
Docker daemon access was denied and `sudo -n docker compose` required an interactive password.
Starting a temporary loopback Redis process was also denied. On a Docker-enabled host, run the root
README flow and record liveness, readiness, model discovery, non-streaming completion, streaming
completion with exactly one `[DONE]`, sanitized upstream failure, Redis fail-closed behavior, and
the independent production-overlay image health before marking T044 complete.
