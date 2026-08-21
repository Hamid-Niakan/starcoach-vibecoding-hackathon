# Architecture Overview

The repository contains two independently buildable Next.js products and one independently
deployable FastAPI AI gateway. Liara Docs consumes the gateway's stateless OpenAI-compatible
`/v1/models` and `/v1/chat/completions` contract. ZarinPal remains disconnected until a later
specification defines analytics-aware AI behavior.

Redis is owned by the gateway solely for atomic anonymous usage enforcement and readiness. Browser
conversation history belongs to Liara's tab-scoped session state; the gateway does not persist
messages. Any future ZarinPal analytical database belongs to that product's data-platform
specification and is not part of the gateway.

Shared packages form a one-way dependency layer and never import application or gateway source.
Gateway consumers use versioned public schemas rather than Python internals. Provider destinations,
protected model identifiers, credentials, trusted proxy policy, and enforcement secrets stay on the
server.

## Liara grounding path

The imported `public/llms` snapshot is an offline build input. Root-owned indexing tools normalize
and structurally chunk it, assign stable passage identities, record an aggregate checksum, publish
a candidate Meilisearch index, and atomically activate only a compatible revision. The gateway
consumes the index contract; it does not import frontend source or crawl the live website.

For each Liara request the gateway applies deterministic intent routing, reserves worst-case token
and integer-cost budgets, optionally makes one bounded planner call, retrieves a bounded set of
official passages, demotes caller and retrieved text to untrusted data, and validates server-owned
source markers before releasing paragraphs. Insufficient, conflicting, or invalid evidence becomes
a clarification or explicit abstention. Standard completion content remains Markdown; one terminal
`x_liara` extension carries the documentation revision, intent, validated citations, next steps,
and optional workflow state.

The browser validates that extension, persists stable state only in `sessionStorage`, renders safe
GFM with explicit bidi islands, and keeps feedback/preferences local. No identity or merchant data
is collected. ZarinPal neither imports nor calls Liara grounding code.

## Operations and release boundary

Redis atomically owns RPM, TPM, quota, concurrency, and daily estimated-cost reservations.
Meilisearch revision compatibility and Redis enforcement are readiness dependencies; provider and
cache failures are request-scoped, with cache failure degrading to uncached work. Metrics are
content-free, bounded-label, no-CORS, no-store, and bearer-protected outside explicit local mode.

Production uses independent Liara gateway and static-docs apps with private Redis and Meilisearch,
not Docker Compose. Public release remains blocked until the supported Next.js upgrade, accepted
held-out/human evaluations, live multi-instance and browser checks, and staging rollback evidence
all pass. See the feature scorecard for the exact evidence state.
