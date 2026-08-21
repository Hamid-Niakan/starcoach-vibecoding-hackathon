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

## Liara quality artifacts

Reviewed evaluation cases and rubrics belong in `evals/liara/`. Generated corpus indexes,
provider responses, evaluation reports, screenshots, model comparisons, and staging/rollback
evidence belong only in `.artifacts/liara/` and remain gitignored. Shareable reports use protected
digests rather than provider/model identifiers and must not include conversation bodies outside the
reviewed dataset, passage excerpts, raw addresses, cache keys, or secrets.

The 300-point evidence index is `docs/challenges/liara-assistant-scorecard.md`. Update a row to
`implemented` only after its documented validation passes; code presence is not evidence.

For feature 007, use `pnpm test:liara` for Node evaluation/index/operations checks and the focused
Python commands in `specs/007-liara-assistant-quality/quickstart.md`. Corpus source and generated
indexes must remain separated: `apps/liara-docs/public/llms` is tracked input and
`.artifacts/liara/index` is generated output. Public contract changes begin in
`packages/contracts`; Python producer and TypeScript consumer parity must be tested together.

Operational changes must update the matching runbook and alert owner. Cost changes must preserve
integer micro-unit arithmetic, protected provider/model identity, worst-case planner/generation
reservation, conservative reconciliation, and the fixed quality-regression gate. Liara deployment
uses `deploy/liara/`, while Compose remains a local development and verification aid only.
