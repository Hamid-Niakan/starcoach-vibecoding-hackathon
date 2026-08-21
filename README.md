# Liara + ZarinPal Hackathon Monorepo

This pnpm/Turborepo contains two independently deployable Next.js products and one authoritative
FastAPI AI gateway:

- `apps/liara-docs` — the official Liara documentation snapshot with an OpenAI-compatible chat
- `apps/zarin-dashboard` — a Persian-first analytics shell; AI connectivity is intentionally deferred
- `ai-gw` — the stateless FastAPI gateway, Redis-backed anonymous enforcement, and operator docs
- `packages/*` — versioned browser contracts, client transport, and shared React UI

The legacy backend is retired. The active public backend routes are `/v1/models`,
`/v1/chat/completions`, `/health/liveness`, and `/health/readiness` on port 4000.

The Liara assistant now builds a deterministic, revision-pinned corpus from the imported official
documentation, retrieves bounded official passages, validates adjacent citations, and returns an
additive terminal `x_liara` object while preserving the OpenAI-compatible API. Retrieval,
intent/workflow policy, protected metrics, route budgets, and safe exact reuse live in `ai-gw`;
conversation history and explicit preferences remain tab-scoped in the browser.

## Prerequisites

- Node.js 24 and pnpm 10.33.0 through Corepack
- Python 3.12 and uv 0.8.13
- Docker Engine with Compose v2
- `curl`; `jq` is useful for smoke tests

```bash
corepack enable
corepack prepare pnpm@10.33.0 --activate
pnpm check:toolchain
```

## Clean-clone setup

```bash
cp .env.example .env
pnpm install --frozen-lockfile
uv --directory ai-gw sync --frozen --extra dev
pnpm exec playwright install chromium
```

The checked-in environment example contains deterministic local fixtures only. Never reuse its API
key or identity secret in a public deployment. Production provider credentials, random identity
secret, exact CORS origins, trusted proxy CIDRs, deployment ID, and policy epoch are operator-owned.

## Run the complete local stack

```bash
docker compose config --quiet
docker compose up --build -d
docker compose ps
```

The one-shot `gateway-bootstrap` service initializes the enforcement policy before the gateway may
become ready. Open:

| Product or probe | URL                                      |
| ---------------- | ---------------------------------------- |
| Liara Docs       | <http://localhost:3001>                  |
| Liara chat       | <http://localhost:3001/chat>             |
| ZarinPal shell   | <http://localhost:3002>                  |
| Gateway          | <http://localhost:4000>                  |
| Liveness         | <http://localhost:4000/health/liveness>  |
| Readiness        | <http://localhost:4000/health/readiness> |

Inspect or stop the stack with:

```bash
docker compose logs gateway-bootstrap gateway
docker compose down
```

The first Meilisearch bootstrap can take several minutes while the multilingual search model is
initialized and 4,962 documentation passages are indexed. The bounded local default is ten minutes;
override `AI_GATEWAY_MEILI_TASK_TIMEOUT_MS` in `.env` if the machine needs longer. The documentation
site starts independently during this bootstrap; chat becomes available once the gateway readiness
check passes.

If a default host port is occupied, set `AI_GATEWAY_PORT`, `REDIS_HOST_PORT`,
`MOCK_UPSTREAM_HOST_PORT`, `LIARA_HOST_PORT`, or `ZARINPAL_HOST_PORT` in `.env`. For example:

```bash
LIARA_HOST_PORT=3101 AI_GATEWAY_PORT=4100 docker compose up --build -d
```

When the public gateway host port changes, set `NEXT_PUBLIC_AI_GATEWAY_URL` to the matching browser
URL before building Liara (for the example above, `http://localhost:4100`).

## Run services natively

Start only the deterministic dependencies:

```bash
docker compose up -d redis mock-upstream
```

In a gateway terminal, point the container-oriented fixture URLs at their published loopback ports,
bootstrap once, and start FastAPI:

```bash
export AI_GATEWAY_MODEL_NAME=liara-docs
export AI_GATEWAY_MODEL=fixture-provider-model
export AI_GATEWAY_API_BASE=http://127.0.0.1:8080/v1
export AI_GATEWAY_API_KEY=fixture-secret-not-for-production
export AI_GATEWAY_REDIS_URL=redis://127.0.0.1:6389/0
export AI_GATEWAY_DEPLOYMENT_ID=local-hackathon
export AI_GATEWAY_ENFORCEMENT_EPOCH=local-v1
export AI_GATEWAY_IDENTITY_SECRET=0123456789abcdef0123456789abcdef
export AI_GATEWAY_MODEL_MAX_INPUT_TOKENS=8192
export AI_GATEWAY_CORS_ALLOW_ORIGINS=http://localhost:3001
export AI_GATEWAY_ALLOW_INSECURE_LOCAL_UPSTREAM=true
export AI_GATEWAY_ALLOW_PRIVATE_UPSTREAM=true
pnpm gateway:bootstrap
pnpm dev:gateway
```

In separate frontend terminals:

```bash
NEXT_PUBLIC_AI_GATEWAY_URL=http://127.0.0.1:4000 pnpm --filter @hackathon/liara-docs dev
pnpm --filter @hackathon/zarin-dashboard dev
```

The public gateway URL is compiled into Liara's static build. Rebuild Liara when it changes.
ZarinPal has no gateway environment variable or runtime dependency in this feature.

### Verify without Docker

Docker is not required for source-level development. The following checks exercise the contracts,
shared chat, corpus builder, gateway unit/contract/security tests, operations guards, and static
builds without opening the Docker socket:

```bash
pnpm liara:index:build
pnpm liara:index:validate
pnpm test:liara
uv --directory ai-gw run --frozen pytest -q -m "not redis and not performance"
pnpm --filter @hackathon/contracts build
pnpm --filter @hackathon/api-client build
pnpm --filter @hackathon/chat-ui build
pnpm --filter @hackathon/liara-docs build
```

Redis multi-replica, complete browser runtime, image, Compose, and Liara staging checks are separate
acceptance gates. If those services or credentials are unavailable, leave their task/evidence rows
blocked; do not replace them with a source-level pass.

## OpenAI-compatible smoke tests

```bash
curl -fsS http://localhost:4000/health/liveness
curl -fsS http://localhost:4000/health/readiness
curl -fsS http://localhost:4000/v1/models

curl -fsS http://localhost:4000/v1/chat/completions \
  -H 'content-type: application/json' \
  -d '{"model":"liara-docs","messages":[{"role":"user","content":"سلام"}]}'

curl -N http://localhost:4000/v1/chat/completions \
  -H 'content-type: application/json' \
  -d '{"model":"liara-docs","messages":[{"role":"user","content":"سلام"}],"stream":true}'
```

The stream must end with exactly one `data: [DONE]`. Requests work without Authorization; a
non-secret placeholder Bearer header is tolerated for SDK compatibility.

## Build and test

```bash
pnpm format:check
pnpm lint
pnpm type-check
pnpm test
pnpm build
pnpm test:e2e
```

Useful focused commands:

| Concern           | Command                                                                                   |
| ----------------- | ----------------------------------------------------------------------------------------- |
| Node workspaces   | `pnpm build:node`, `pnpm lint:node`, `pnpm type-check:node`, `pnpm test:node`             |
| FastAPI gateway   | `pnpm build:gateway`, `pnpm lint:gateway`, `pnpm type-check:gateway`, `pnpm test:gateway` |
| Operations guards | `pnpm test:ops`                                                                           |
| One frontend      | `pnpm --filter @hackathon/liara-docs build`                                               |

Feature-007 Liara quality work uses tracked cases under `evals/liara/` and writes generated
indexes, reports, screenshots, and staging evidence under the gitignored `.artifacts/liara/` tree.
The root commands added by that feature are:

| Liara quality concern          | Command                                                                        |
| ------------------------------ | ------------------------------------------------------------------------------ |
| Scorecard baseline/final       | `pnpm liara:audit --mode baseline` / `pnpm liara:audit --mode final`           |
| Validate evaluation inputs     | `pnpm liara:eval:validate`                                                     |
| Build/validate corpus          | `pnpm liara:index:build` / `pnpm liara:index:validate`                         |
| Retrieval/answer/cost evidence | `pnpm liara:eval:retrieval`, `pnpm liara:eval:answers`, `pnpm liara:eval:cost` |
| Remote staging acceptance      | `pnpm liara:staging:accept -- --gateway-url … --docs-url … --model …`          |
| Liara source/ops tests         | `pnpm test:liara`                                                              |

These commands never write generated output into tracked source directories.

Redis-backed gateway integration suites use the local Redis mapping:

```bash
TEST_REDIS_URL=redis://127.0.0.1:6389/0 uv --directory ai-gw run pytest \
  tests/integration/test_rate_limiter_toctou.py \
  tests/integration/test_multi_instance_atomicity.py \
  tests/integration/test_reservation_reconciliation.py \
  tests/integration/test_readiness_failure_modes.py -q
```

## Independent deployment definitions

- `deploy/compose.gateway.yaml` — Redis, one-shot bootstrap, and gateway only
- `deploy/compose.liara.yaml` — Liara static frontend configured with the external gateway URL
- `deploy/compose.zarin.yaml` — disconnected ZarinPal frontend only

Validate the production gateway overlay by supplying every operator-owned value:

```bash
AI_GATEWAY_MODEL_NAME=liara-docs \
AI_GATEWAY_MODEL=provider-model \
AI_GATEWAY_API_BASE=https://provider.example/v1 \
AI_GATEWAY_API_KEY='provider-secret' \
AI_GATEWAY_DEPLOYMENT_ID=production \
AI_GATEWAY_ENFORCEMENT_EPOCH=policy-v1 \
AI_GATEWAY_IDENTITY_SECRET='replace-with-32-or-more-random-bytes' \
AI_GATEWAY_MODEL_MAX_INPUT_TOKENS=8192 \
AI_GATEWAY_CORS_ALLOW_ORIGINS=https://docs.example.com \
AI_GATEWAY_TRUSTED_PROXY_CIDRS=10.0.0.0/8 \
docker compose -f deploy/compose.gateway.yaml config --quiet
```

Run `gateway-bootstrap` once for each changed enforcement policy before starting gateway instances.
Provider availability is deliberately excluded from readiness; Redis or marker failure makes
readiness return 503 and admissions fail closed.

For an actual deployment, keep the same values in a protected file outside the repository and run:

```bash
docker compose --env-file /secure/path/gateway.env \
  -f deploy/compose.gateway.yaml up --build -d

NEXT_PUBLIC_AI_GATEWAY_URL=https://gateway.example.com \
  docker compose -f deploy/compose.liara.yaml up --build -d

docker compose -f deploy/compose.zarin.yaml up --build -d
```

The Liara URL is a build-time value and must be reachable by visitors' browsers. The ZarinPal
overlay accepts no gateway URL and starts independently.

## Troubleshooting

- **Gateway never becomes ready:** inspect `docker compose logs gateway-bootstrap gateway`; verify
  Redis is healthy and the bootstrap and gateway environment fingerprints are identical.
- **Readiness became 503 after Redis recovery:** rerun `docker compose run --rm gateway-bootstrap`,
  then restart the gateway.
- **Completion returns 502/504 while readiness is 200:** readiness does not probe the provider.
  Check the provider URL/key and sanitized gateway request ID.
- **Browser CORS failure:** add the exact Liara scheme/host/port to
  `AI_GATEWAY_CORS_ALLOW_ORIGINS`; wildcard origins are rejected.
- **Port conflict:** use the host-port variables listed above; Redis defaults to 6389, not 6379.
- **Docker permission denied:** verify the daemon and your user's Docker access with `docker info`.
- **Toolchain mismatch:** use `.tool-versions`, `.nvmrc`, and `.python-version`, then rerun
  `pnpm check:toolchain`.

## Release block

`pnpm release:check` is expected to fail while either frontend remains on unsupported Next.js 14.
This repository may be exercised locally, but no public deployment or hackathon submission is
permitted until the dedicated supported-version feature passes.

Liara upstream provenance and update instructions remain in
[`docs/architecture/liara-upstream.md`](docs/architecture/liara-upstream.md). Gateway import
provenance and operator boundaries are in
[`docs/architecture/ai-gateway-upstream.md`](docs/architecture/ai-gateway-upstream.md).
The grounded-assistant topology is summarized in
[`docs/architecture/overview.md`](docs/architecture/overview.md); ingestion, operations, cost, and
Liara-native deployment procedures are in [`evals/liara/README.md`](evals/liara/README.md),
[`ai-gw/docs/liara-assistant-operations.md`](ai-gw/docs/liara-assistant-operations.md),
[`ai-gw/docs/liara-assistant-cost-policy.md`](ai-gw/docs/liara-assistant-cost-policy.md), and
[`deploy/liara/README.md`](deploy/liara/README.md).
