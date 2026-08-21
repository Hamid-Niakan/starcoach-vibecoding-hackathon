# Liara Assistant Operations

Owner for every alert in this document: `liara-assistant-operators`. Never paste prompts, answers,
source passages, API keys, client addresses, or protected provider identifiers into incident notes.
Correlate with the public request ID and bounded metric labels only.

## not-ready

Verify `/health/liveness`, then `/health/readiness`. Check Redis enforcement and the active index
revision independently. A missing or mismatched index is fail-closed. Restore the compatible index
or roll back the gateway and index as one recorded release; do not bypass readiness.

## log-drops

Inspect the configured log sink, queue capacity, and retention destination. Reduce nonessential
scraping pressure or restore the sink. Treat missing audit events as critical and retain the drop
counter plus deployment digest in the incident record.

## high-5xx

Split failures by the existing closed outcome and failure-category labels. Check index availability,
provider connectivity, response validation, and recent release changes. Roll back if the rate began
with a release; never expose upstream response bodies while diagnosing.

## timeouts

Compare retrieval, TTFT, upstream, and total duration histograms. Verify absolute deadlines and
cancellation cleanup. Tighten passage/output budgets or restore the slow dependency; do not raise
deadlines without evaluation evidence.

## slow-ttft

Inspect retrieval latency and selected-passage counts before provider latency. Confirm the active
index and private network path. Use the fixed evaluation cases to validate any retrieval-budget
change.

## slow-completion

Inspect route mix, output-token counts, upstream duration, and timeout outcomes. Prefer bounded
output/context changes and rollback over an unmeasured timeout increase.

## limit-exhaustion

Determine whether client or global RPM, TPM, concurrency, or quota is active. Verify trusted proxy
identity configuration before changing a limit. Capacity changes require cost and abuse review.

## retrieval-anomaly

Check Meilisearch readiness, active alias/revision, document count, and private-network latency.
Restore the last compatible immutable index if checksum or count differs.

## cache-anomaly

Cache failure is degradable: confirm requests continue uncached and enforcement Redis remains
fail-closed. Disable or flush only the revision-namespaced grounding cache; never flush enforcement
keys as a cache response.

## daily-cost

Compare estimated micro-units with token counters and configured coefficients. At warning, tighten
complex route budgets and review cache eligibility. At critical, reject/shorten according to policy
or roll back the traffic change. Provider identities and price coefficients stay operator-only.

## Dependency recovery and validation

After any recovery, require readiness, one grounded direct case, one complex cited case, a sanitized
failure, limit enforcement, and a content-free metrics/log inspection. Record timestamp, operator,
Git SHA, corpus revision digest, image digest, outcome, and rollback decision—never secret values.
