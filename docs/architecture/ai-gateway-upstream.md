# AI Gateway Import and Operations Boundary

The `ai-gw/` tree entered this integration through the `feat/ai-gateway-backend` source tip
`147887d23f78865fe718971a2bbd9e787bb54e72`. That immutable commit remains in Git history; feature
006 adapts repository orchestration and consumer integration without squashing or rewriting it.

## Authoritative ownership

`ai-gw/` is the only active backend. It owns OpenAI-compatible request validation, public model
aliasing, provider isolation, anonymous identity derivation, atomic Redis admission/reconciliation,
stream normalization, bounded errors, request correlation, health, and operational metrics. It does
not own browser conversation history, Liara source, ZarinPal analytics, PostgreSQL, or DuckDB.

Liara consumes `/v1/models` and `/v1/chat/completions` through the public contract. ZarinPal remains
disconnected until a later specification defines its policy and analytical context.

## Local orchestration

The root Compose stack uses local fixture values and follows this order:

1. Redis becomes healthy.
2. `gateway-bootstrap` writes the current policy fingerprint and exits successfully.
3. The deterministic mock upstream starts.
4. The gateway starts and becomes healthy only when `/health/readiness` succeeds.
5. Liara waits for ready gateway; ZarinPal starts independently.

The gateway-only `ai-gw/compose.yaml` follows the same enforcement sequence. The mock path is for
local reproducibility only and is absent from `deploy/compose.gateway.yaml`.

## Production operator responsibilities

Operators supply provider credentials, provider destination/model, a random identity secret of at
least 32 bytes, a stable deployment ID, an explicit enforcement epoch, exact Liara browser origins,
and trusted ingress CIDRs. Values must be injected at runtime and must not enter frontend build
arguments, logs, or version control.

Redis data is persistent. Bootstrap is a deliberate one-shot operation for the exact policy used by
the gateway; changed policies require a new epoch or an explicitly coordinated bootstrap. Gateway
readiness depends on Redis, the matching marker, loaded scripts, and absence of inconsistency state.
Provider reachability is not a readiness dependency and is represented by sanitized per-request
errors.

## Future source updates

Import future gateway work by merging a reviewed commit that descends from the recorded source tip.
Record the new commit and merge provenance, resolve integration changes on a new feature branch,
and rerun gateway contract/security/Redis suites plus root Compose and Liara browser tests. Never
force-move or rewrite the recorded source branch merely to update the integration.
