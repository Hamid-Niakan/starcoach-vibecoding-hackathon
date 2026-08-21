# Contributing

Work from a feature branch, keep `.specify/feature.json` pointed at the active feature, and complete
specification, plan, and dependency-ordered tasks before implementation. Do not move or rewrite the
recorded integration source tips.

The Node workspaces and Python gateway are independently filterable:

```bash
pnpm --filter @hackathon/liara-docs dev
pnpm --filter @hackathon/zarin-dashboard dev
pnpm dev:gateway

pnpm lint:node
pnpm lint:gateway
pnpm type-check:node
pnpm type-check:gateway
pnpm test:node
pnpm test:gateway
pnpm test:ops
```

Run `pnpm format:check`, `pnpm lint`, `pnpm type-check`, `pnpm test`, and `pnpm build` before handing
work to another teammate. Gateway behavior also requires the Redis-backed suites documented in
`ai-gw/README.md`.

The authoritative backend is the FastAPI service in `ai-gw/`. Frontends consume only its public
OpenAI-compatible contract; they must not import gateway source. ZarinPal remains disconnected until
a later specification authorizes its integration.

Do not commit `.env`, provider credentials, identity secrets, virtual environments, caches, raw
merchant data, or generated analytical databases. New or materially changed code must use strict
TypeScript or strict Python typing as applicable. Imported Liara legacy JavaScript may remain until
it is materially changed.
