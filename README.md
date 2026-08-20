# Liara + ZarinPal Hackathon Monorepo

Two independently deployable products share one NestJS API and a reusable streaming chat layer:

- `apps/liara-docs`: official Liara documentation snapshot plus documentation assistant UI
- `apps/zarin-dashboard`: Persian-first merchant analytics shell
- `apps/api`: shared chat, persistence, analytics, health, and observability boundary

## Prerequisites

- Node.js 24 (see `.nvmrc`; Node 22 can be used temporarily for local development)
- Corepack and pnpm 10.33.0
- Docker with Compose v2 for PostgreSQL and production-like startup

## Clean-clone setup

```bash
corepack enable
corepack prepare pnpm@10.33.0 --activate
cp .env.example .env
pnpm install --frozen-lockfile
docker compose up -d postgres
pnpm --filter @hackathon/api db:migrate
pnpm dev
```

Local URLs: Liara `http://localhost:3001`, ZarinPal `http://localhost:3002`, API `http://localhost:3000/api/health`.

## Workspace commands

| Task         | Entire repository   | One workspace example                            |
| ------------ | ------------------- | ------------------------------------------------ |
| Develop      | `pnpm dev`          | `pnpm --filter @hackathon/api dev`               |
| Build        | `pnpm build`        | `pnpm --filter @hackathon/zarin-dashboard build` |
| Test         | `pnpm test`         | `pnpm --filter @hackathon/contracts test`        |
| Type-check   | `pnpm type-check`   | `pnpm --filter @hackathon/chat-ui type-check`    |
| Lint         | `pnpm lint`         | `pnpm --filter @hackathon/api lint`              |
| Format check | `pnpm format:check` | —                                                |

`pnpm release:check` intentionally fails while either frontend remains on unsupported Next.js 14.

## Containers

`docker compose up --build` starts PostgreSQL, API, and both frontends. Independent deployment definitions are in `deploy/compose.liara.yaml`, `deploy/compose.zarin.yaml`, and `deploy/compose.api.yaml`; all use the repository root as build context.

## Liara upstream updates

The snapshot source and exact commit are recorded in [`docs/architecture/liara-upstream.md`](docs/architecture/liara-upstream.md). Update it from a clean tree with:

```bash
git subtree pull --prefix=apps/liara-docs https://github.com/liara-cloud/docs.git master --squash
```

Reapply only documented workspace integration changes, run all root checks, and update the recorded commit.

## Troubleshooting

- If chat creation returns 503, start PostgreSQL and run `pnpm --filter @hackathon/api db:migrate`.
- If native DuckDB loading fails, use a supported x64/arm64 Linux, macOS, or Windows environment or run the API image.
- Meilisearch is optional for the imported documentation baseline; missing search credentials must not block page rendering.
- Never commit `.env`, raw ZarinPal data, PostgreSQL volumes, or DuckDB database files.
