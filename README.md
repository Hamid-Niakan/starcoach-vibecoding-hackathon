# Liara + ZarinPal Hackathon Monorepo

Two independently deployable products share one NestJS API and a reusable streaming chat layer:

- `apps/liara-docs`: official Liara documentation snapshot plus documentation assistant UI
- `apps/zarin-dashboard`: Persian-first merchant analytics shell
- `apps/api`: shared chat, persistence, analytics, health, and observability boundary
- `packages/contracts`: framework-neutral REST and SSE schemas
- `packages/api-client`: validated REST and streaming client
- `packages/chat-ui`: shared React chat experience

## Local URLs

| Service                  | URL                                      |
| ------------------------ | ---------------------------------------- |
| Liara documentation      | <http://localhost:3001>                  |
| Liara full-screen chat   | <http://localhost:3001/chat>             |
| ZarinPal dashboard       | <http://localhost:3002>                  |
| API compatibility health | <http://localhost:3000/api/health>       |
| API liveness             | <http://localhost:3000/api/health/live>  |
| API readiness            | <http://localhost:3000/api/health/ready> |
| PostgreSQL               | `localhost:5432` by default              |

## Prerequisites

- Node.js 24 (see `.nvmrc`; Node 22.14 or newer can be used temporarily for local development)
- Corepack and pnpm 10.33.0
- Docker with Compose v2, at minimum for PostgreSQL
- Optional: `curl` and `jq` for command-line API testing

Confirm the toolchain:

```bash
node --version
corepack --version
docker compose version
```

## First-time setup

Run these commands from the repository root:

```bash
corepack enable
corepack prepare pnpm@10.33.0 --activate
cp .env.example .env
pnpm install --frozen-lockfile
```

The `.env` file is ignored by Git. The checked-in defaults are suitable for the local PostgreSQL service and do not contain production credentials.

## Run everything with Docker

This is the simplest production-like startup. It builds and starts PostgreSQL, the API, Liara documentation, and the ZarinPal dashboard:

```bash
docker compose up --build
```

Wait until the API is healthy, then open the frontend URLs from the table above. To run in the background and inspect status:

```bash
docker compose up --build -d
docker compose ps
docker compose logs -f api
```

Stop the stack without deleting database volumes:

```bash
docker compose down
```

## Run everything in development mode

Use Docker only for PostgreSQL and run the applications with hot reload:

```bash
docker compose up -d postgres
set -a
source .env
set +a
export DUCKDB_PATH="$PWD/data/analytics.duckdb"
export ZARINPAL_DATA_DIR="$PWD/data/zarinpal"
pnpm --filter @hackathon/api db:migrate
pnpm dev
```

`source .env` is important: pnpm and Turborepo do not automatically export the root `.env` file into application processes. The two absolute path exports account for Turborepo running the API task from `apps/api`. The API also runs pending migrations at startup, so the explicit migration command is safe and useful for diagnosing database configuration.

`pnpm dev` starts all three applications concurrently. Stop them with `Ctrl+C`; PostgreSQL continues running until `docker compose stop postgres` or `docker compose down` is used.

## Run applications separately

Start PostgreSQL first:

```bash
docker compose up -d postgres
```

Then use separate terminals from the repository root.

Terminal 1 — API:

```bash
set -a
source .env
set +a
export DUCKDB_PATH="$PWD/data/analytics.duckdb"
export ZARINPAL_DATA_DIR="$PWD/data/zarinpal"
pnpm --filter @hackathon/api dev
```

Terminal 2 — Liara documentation:

```bash
pnpm --filter @hackathon/liara-docs dev
```

Terminal 3 — ZarinPal dashboard:

```bash
pnpm --filter @hackathon/zarin-dashboard dev
```

Both frontends default to `http://localhost:3000` for the API. To use another backend, export `NEXT_PUBLIC_API_URL` before starting or building the frontend:

```bash
export NEXT_PUBLIC_API_URL=https://api.example.com
pnpm --filter @hackathon/zarin-dashboard dev
```

The frontend shells render without the API, but creating or restoring a conversation will fail until the API and PostgreSQL are ready.

## Manual smoke test

### 1. Verify API health

```bash
curl -i http://localhost:3000/api/health
curl -i http://localhost:3000/api/health/live
curl -i http://localhost:3000/api/health/ready
```

Expected results:

- `/api/health` returns exactly `{"status":"ok"}`.
- `/api/health/live` returns HTTP 200 while the process is alive.
- `/api/health/ready` returns HTTP 200 only when PostgreSQL and DuckDB are ready; HTTP 503 identifies degraded storage.

### 2. Test chat through both UIs

1. Open <http://localhost:3001/chat> and send a Liara question.
2. Confirm that the mock answer appears incrementally rather than all at once.
3. Reload the page and confirm that conversation history returns.
4. Open <http://localhost:3002> and repeat the test for ZarinPal.
5. While a response is streaming, use the stop button and confirm that the UI reports the cancelled response safely.

The first milestone intentionally uses a deterministic mock provider and requires no AI API key.

### 3. Test the REST and SSE API directly

The following example requires `jq`:

```bash
conversation=$(curl -fsS -X POST http://localhost:3000/api/v1/liara/conversations)
conversation_id=$(printf '%s' "$conversation" | jq -r .conversationId)
access_token=$(printf '%s' "$conversation" | jq -r .accessToken)

curl -N \
  -H "Authorization: Bearer $access_token" \
  -H "Content-Type: application/json" \
  -d '{"content":"چطور یک برنامه Node.js روی لیارا مستقر کنم؟"}' \
  "http://localhost:3000/api/v1/liara/conversations/$conversation_id/messages"

curl -fsS \
  -H "Authorization: Bearer $access_token" \
  "http://localhost:3000/api/v1/liara/conversations/$conversation_id" | jq
```

The streaming response should include `message.started`, multiple `message.delta` events, and `message.completed`. Product isolation can be checked with the same credentials; this request must return HTTP 404:

```bash
curl -i \
  -H "Authorization: Bearer $access_token" \
  "http://localhost:3000/api/v1/zarinpal/conversations/$conversation_id"
```

To verify persistence, send a message, restart only the API, then reload the frontend or repeat the conversation `GET` request.

## Automated tests and quality checks

Run the complete terminating check set before handing work to another teammate:

```bash
pnpm format:check
pnpm lint
pnpm type-check
pnpm test
pnpm build
```

Run a check for one workspace while developing:

```bash
pnpm --filter @hackathon/api test
pnpm --filter @hackathon/api type-check
pnpm --filter @hackathon/contracts test
pnpm --filter @hackathon/chat-ui type-check
pnpm --filter @hackathon/liara-docs build
pnpm --filter @hackathon/zarin-dashboard build
```

Workspace command summary:

| Task         | Entire repository   | One workspace example                            |
| ------------ | ------------------- | ------------------------------------------------ |
| Develop      | `pnpm dev`          | `pnpm --filter @hackathon/api dev`               |
| Build        | `pnpm build`        | `pnpm --filter @hackathon/zarin-dashboard build` |
| Test         | `pnpm test`         | `pnpm --filter @hackathon/contracts test`        |
| Type-check   | `pnpm type-check`   | `pnpm --filter @hackathon/chat-ui type-check`    |
| Lint         | `pnpm lint`         | `pnpm --filter @hackathon/api lint`              |
| Format check | `pnpm format:check` | —                                                |

`pnpm release:check` intentionally fails while either frontend remains on unsupported Next.js 14. This is a deployment gate, not a failing local setup. Complete feature 005 before any public release.

## Independent container definitions

The files under `deploy/` build exactly one deployable and use the repository root as their build context:

- `deploy/compose.liara.yaml`
- `deploy/compose.zarin.yaml`
- `deploy/compose.api.yaml`

Example configuration validation:

```bash
NEXT_PUBLIC_API_URL=https://api.example.com \
  docker compose -f deploy/compose.liara.yaml config

NEXT_PUBLIC_API_URL=https://api.example.com \
  docker compose -f deploy/compose.zarin.yaml config

DATABASE_URL=postgres://user:password@database.example.com/app \
CORS_ORIGINS=https://liara.example.com,https://zarin.example.com \
  docker compose -f deploy/compose.api.yaml config
```

## Liara upstream updates

The snapshot source and exact commit are recorded in [`docs/architecture/liara-upstream.md`](docs/architecture/liara-upstream.md). Update it from a clean tree with:

```bash
git subtree pull --prefix=apps/liara-docs https://github.com/liara-cloud/docs.git master --squash
```

Reapply only documented workspace integration changes, run all root checks, and update the recorded commit.

## Troubleshooting

- **Chat returns 503:** confirm `docker compose ps postgres`, export `.env`, and restart the API. Check `/api/health/ready` for the failing storage dependency.
- **`DATABASE_URL is required`:** run `set -a; source .env; set +a` in the terminal executing API or migration commands.
- **PostgreSQL port 5432 is already in use:** keep the existing database and start Compose with `sudo env POSTGRES_HOST_PORT=5433 docker compose up --build`. For native API development, also set `DATABASE_URL=postgres://hackathon:hackathon@localhost:5433/hackathon`.
- **Another port is already in use:** ports 3000, 3001, and 3002 must be available, or the relevant Compose mapping must be changed.
- **Liara model fetch is unavailable:** the build uses the committed model snapshot and continues without network access.
- **Search is unavailable:** Meilisearch is optional for this baseline; missing search credentials must not block documentation rendering.
- **DuckDB native module fails to load:** use a supported x64/arm64 Linux, macOS, or Windows environment, reinstall dependencies for the current platform, or run the API container.
- **Stale dependencies:** confirm the Node and pnpm versions, then run `pnpm install --frozen-lockfile` again.
- **Docker API permission denied:** ensure the Docker daemon is running and that your user can access it, then verify with `docker info`.

Never commit `.env`, raw ZarinPal datasets, PostgreSQL volumes, DuckDB database files, or secrets.
