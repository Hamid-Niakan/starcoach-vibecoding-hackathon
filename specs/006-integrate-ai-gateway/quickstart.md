# Phase 1 Quickstart: Validate AI Gateway Integration

This guide defines the runnable acceptance path for feature 006. Commands assume the repository
root. Public deployment remains blocked while the frontend release check detects Next.js 14.

## Prerequisites

- Git with both source branch tips available
- Node.js 24 and Corepack
- pnpm 10.33.0
- Python 3.12 and uv 0.8.13 matching the gateway image/toolchain contract
- Docker Engine with Compose v2
- `curl`; `jq` is useful for readable JSON
- Playwright-supported Chromium for automated browser checks

Confirm versions:

```bash
node --version
pnpm --version
python --version
uv --version
docker compose version
```

## 1. Verify merge ancestry and active feature

```bash
git merge-base --is-ancestor ea3585676596ecd52b96746c4349ca19c68d0b4d HEAD
git merge-base --is-ancestor 147887d23f78865fe718971a2bbd9e787bb54e72 HEAD
cat .specify/feature.json
```

Both ancestry commands must exit zero. These are the pinned source tips; moving branch names do not
change acceptance and this feature does not rewrite either commit.

## 2. Install both locked toolchains

```bash
corepack enable
corepack prepare pnpm@10.33.0 --activate
pnpm install --frozen-lockfile
cd ai-gw
uv sync --frozen --extra dev
cd ..
```

Copy the root environment example. Its valid mock API key and 32-byte identity secret are clearly
labeled fixture-only so the deterministic stack starts without paid credentials. Deployment
overlays require independently supplied production secrets; provider credentials must never enter
a frontend build argument or Git.

```bash
cp .env.example .env
```

## 3. Start the deterministic complete stack

```bash
docker compose config --quiet
docker compose up --build -d
docker compose ps
```

Expected services:

- `redis` becomes healthy.
- `gateway-bootstrap` exits successfully after writing the matching enforcement marker.
- `mock-upstream` runs only for deterministic local validation.
- `gateway` health ordering uses readiness—not liveness—and becomes ready on
  `http://localhost:4000`.
- Liara renders at `http://localhost:3001` and chat at `http://localhost:3001/chat`.
- ZarinPal renders at `http://localhost:3002` without a gateway dependency.
- No PostgreSQL, DuckDB, or NestJS service is present.

Inspect sanitized logs when startup fails:

```bash
docker compose logs gateway-bootstrap gateway
```

## 4. Validate health and OpenAI compatibility

```bash
curl -fsS http://localhost:4000/health/liveness
curl -fsS http://localhost:4000/health/readiness
curl -fsS http://localhost:4000/v1/models | jq
curl -fsS http://localhost:4000/openapi.json | jq '.paths | keys'
```

Expected health bodies are `{"status":"alive"}` and `{"status":"ready"}`. Model discovery
returns exactly one public alias and does not expose the fixture/provider model.

Use the discovered alias for a non-streaming completion:

```bash
model=$(curl -fsS http://localhost:4000/v1/models | jq -r '.data[0].id')
curl -fsS http://localhost:4000/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -d "{\"model\":\"$model\",\"messages\":[{\"role\":\"user\",\"content\":\"سلام\"}]}" | jq
```

Validate streaming without a credential:

```bash
curl -N http://localhost:4000/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -d "{\"model\":\"$model\",\"messages\":[{\"role\":\"user\",\"content\":\"سلام\"}],\"stream\":true}"
```

The output contains multiple validated `data:` JSON chunks and exactly one `data: [DONE]`. Repeat
with `-H 'Authorization: Bearer anonymous-placeholder'`; behavior must be identical and the value
must not appear in gateway or mock-upstream logs.

Validate browser preflight behavior: an allowed origin may send `content-type` and optional
`authorization`, and the response exposes `x-request-id`; a disallowed origin receives no CORS
grant. An origin-less curl/OpenAI SDK request remains accepted. These cases are also automated in
the gateway contract suite.

## 5. Validate Liara in a browser

Open `http://localhost:3001/chat` at desktop and mobile viewport sizes.

1. Confirm Persian RTL chrome, keyboard focus, an empty state, and LTR rendering for code/URLs.
2. Send a Persian question and observe more than one visible response increment.
3. Send a follow-up and verify the request contains prior visible user/assistant content.
4. Cancel a stream. Confirm partial text remains marked as stopped.
5. Send a follow-up and confirm the stopped text remains in the request context.
6. Retry the stopped turn and confirm its assistant response is replaced rather than duplicated.
7. Reload the same tab and confirm the conversation returns.
8. Open an independent tab with `noopener` and confirm it starts with no conversation; do not rely
   on opener-created tabs because browsers may clone their initial session storage.
9. Seed the session key with invalid/legacy JSON, reload, and confirm chat recovers with empty state.
10. Reload while a response is streaming and confirm restored partial content is marked stopped.
11. Confirm `/v1/models` is requested once in the browser session. Playwright route interception
    supplies zero, multiple, and malformed model-list fixtures and proves no completion is sent.

Streaming accessibility tests verify `aria-busy`, visible keyboard-operable stop/retry controls,
focus recovery after cancellation/error, throttled or terminal-only live announcements that do not
repeat every token, and LTR code/URL islands within the RTL interface.

For every bounded failure, the UI shows a recoverable Persian message and a safe request ID when
available, without provider identity or raw error content.

## 6. Validate ZarinPal isolation

Open `http://localhost:3002` at desktop and mobile widths. It must render its analytics shell and a
clearly disabled/deferred AI state. Browser network logs must contain no request to port 4000 or any
`/v1/` gateway route.

Static inspection must also find no gateway package or environment coupling:

```bash
rg '@hackathon/(api-client|chat-ui|contracts)|NEXT_PUBLIC_AI_GATEWAY_URL|/v1/' apps/zarin-dashboard
```

The command must return no matches.

## 7. Run automated quality gates

Gateway checks:

```bash
cd ai-gw
uv run ruff check src tests
uv run mypy src
uv run pytest -q
cd ..
```

Redis-backed integration gates use the root Redis mapping:

```bash
TEST_REDIS_URL=redis://127.0.0.1:6389/0 uv --directory ai-gw run pytest \
  tests/integration/test_rate_limiter_toctou.py \
  tests/integration/test_multi_instance_atomicity.py \
  tests/integration/test_reservation_reconciliation.py \
  tests/integration/test_readiness_failure_modes.py -q
```

Workspace and browser checks:

```bash
pnpm format:check
pnpm lint
pnpm type-check
pnpm test
pnpm build
pnpm test:e2e
```

The client tests must cover split CRLF/LF frames and comments, event/buffer/stream/text bounds,
missing `[DONE]`, malformed JSON, non-2xx OpenAI errors, incomplete mid-stream failures, optional
Authorization, exposed request ID retention, and abort propagation. Producer tests guarantee at
most one public `[DONE]`. UI tests must cover storage versioning, reload-during-stream normalization,
turn pairing, model cardinality, stopped context, retry replacement, Persian recovery states, and
accessibility.

The Playwright performance gate sends exactly 20 sequential mock requests, records the time from
submission to first visible assistant content, and fails unless at least 19 measurements are at or
below 2 seconds.

## 8. Validate readiness failure behavior

Invalid gateway configuration must fail startup with a bounded message before a readiness endpoint
exists. With valid startup, stop Redis and query readiness:

```bash
docker compose stop redis
curl -i http://localhost:4000/health/readiness
```

Readiness must return HTTP 503 and new completions must fail closed without upstream dispatch.
Restart Redis and rerun bootstrap before expecting readiness:

```bash
docker compose start redis
docker compose run --rm gateway-bootstrap
docker compose restart gateway
```

Separately stop only `mock-upstream`. Readiness must remain HTTP 200, while a completion returns a
sanitized 502/504 error with no fixture destination or protected model.

## 9. Validate independent deployment definitions

```bash
docker compose -f deploy/compose.gateway.yaml config --quiet
NEXT_PUBLIC_AI_GATEWAY_URL=https://gateway.example.com \
  docker compose -f deploy/compose.liara.yaml config --quiet
docker compose -f deploy/compose.zarin.yaml config --quiet
```

The gateway overlay includes Redis/bootstrap/gateway persistence and readiness-based ordering. It
requires `AI_GATEWAY_TRUSTED_PROXY_CIDRS` and the forwarded-hop limit to match the known Liara
ingress; an empty value is valid only for direct access and would collapse users behind an ingress
into one enforcement identity. The Liara overlay builds only the static docs frontend with
`NEXT_PUBLIC_AI_GATEWAY_URL` embedded at `next build`. The ZarinPal overlay contains no gateway URL.
Security tests prove untrusted forwarded headers are ignored and trusted-proxy chains are bounded.

## 10. Confirm legacy removal and release block

```bash
test ! -d apps/api
test ! -f deploy/compose.api.yaml
rg '@hackathon/api|apps/api|DATABASE_URL|DUCKDB_PATH|POSTGRES_HOST_PORT|api/v1/.*/conversations' \
  README.md CONTRIBUTING.md package.json pnpm-workspace.yaml turbo.json compose.yaml deploy \
  apps/*/package.json apps/*/Dockerfile* packages/*/package.json
pnpm release:check
```

The legacy scan must have no active instruction or runtime reference. `pnpm release:check` is
expected to fail while either frontend remains on Next.js 14; that failure proves the public release
gate is still active.

## 11. Stop local services

```bash
docker compose down
```

Add `--volumes` only when intentionally discarding local Redis enforcement data; after doing so,
bootstrap is required on the next startup.
