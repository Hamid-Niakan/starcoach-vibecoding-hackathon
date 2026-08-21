# Liara assistant cost policy

The public API advertises only the stable `liara-assistant` alias. Provider and protected model
identifiers, credentials, and price coefficients are operator-owned secrets and must never appear
in responses, browser bundles, metrics labels, logs, or evidence reports.

## Selection and route budgets

Candidate providers are measured against the same held-out revision and evaluation cases. The
operator selects the lowest-cost candidate that passes the declared quality and p95 latency gates;
public evidence contains only a one-way policy digest and aggregate measurements.

- Direct answers reserve bounded history, 2,500 retrieval tokens, and 600 output tokens.
- Complex answers reserve bounded history, 6,000 retrieval tokens, 1,200 output tokens, and—only
  when eligible—one 1,000-input/200-output planner call.
- Clarification, abstention, out-of-scope, and elevated-risk routes reserve no retrieval and at most
  200 output tokens.
- History is shortened before admission when necessary. A route that cannot fit its token or
  integer micro-unit ceiling is rejected before generation.

Redis atomically reserves both worst-case tokens and estimated integer micro-units. Reconciliation
adds planner and generation usage exactly once; missing trustworthy usage retains the conservative
reservation. At 80% of the daily aggregate budget, operators receive a warning. Requests that
would exceed 100% are rejected until the UTC budget window rolls over.

## Safe reuse

Arbitrary conversational answers are never cached. Exact retrieval reuse uses an HMAC of the
normalized query, documentation revision, and retrieval-policy version. Reviewed FAQ answers are
eligible only when content-free review state is explicit, all citations are valid and revision
compatible, and no secret, personal data, merchant identifier, request identifier, or account data
is present. Both stores have bounded capacity and a maximum initial TTL of one hour; a revision or
policy change is an immediate namespace invalidation. Cache failure degrades to an uncached request
and never weakens rate, token, quota, concurrency, or cost enforcement.

## Acceptance

Run the held-out quality corpus and the same repeated workload with reuse disabled and enabled.
Optimization is accepted only when estimated cost falls by at least 25% and aggregate quality falls
by no more than two points. Record token classes, retrieval count, latency, cache outcome, and
integer cost totals without prompts, answers, passage text, client identities, or protected model
names. Price coefficients and aggregate thresholds are owned and reviewed by the deployment
operator whenever provider pricing changes.
