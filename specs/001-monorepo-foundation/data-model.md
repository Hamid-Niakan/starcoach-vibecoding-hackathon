# Data Model: Monorepo Foundation

This feature introduces no persistent product entities.

## Workspace

- `name`: unique `@hackathon/*` identifier
- `path`: application or package directory
- `kind`: `application | package`
- `scripts`: supported root-orchestrated tasks
- `dependencies`: public workspace dependencies only

## Upstream Snapshot

- `repository`: `https://github.com/liara-cloud/docs`
- `branch`: `master`
- `commit`: exact imported SHA recorded during implementation
- `importedAt`: ISO date
- `path`: `apps/liara-docs`

## Deployable

- `name`: `liara | zarinpal | api`
- `dockerfile`: production build definition
- `healthcheck`: application-specific health probe
- `environmentContract`: documented variables without secret values
