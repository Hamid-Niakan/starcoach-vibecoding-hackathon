# Quickstart Validation: Liara Assistant Quality

This guide describes the acceptance flow that implementation must make runnable. It validates the
feature from a clean clone without treating unavailable production access as a pass.

## 1. Prerequisites

- Node.js 24.x and Corepack with repository-pinned pnpm 10.33.0
- Python 3.12 and uv 0.8.13
- Docker Engine with Compose v2 for the complete local stack
- Chromium installed through `pnpm exec playwright install chromium`
- `jq` for the sample contract checks
- Operator-owned provider, Redis, Meilisearch, and metrics secrets for live/staging validation
- A reviewed Liara evaluation dataset and approved upstream docs revision

Before public deployment, both prerequisites must be closed:

1. Feature 006's previously blocked live Redis/container/browser evidence passes.
2. Feature 005 upgrades the Liara frontend to a supported patched Next.js line and
   `pnpm release:check` passes.

If Liara credentials, staging app IDs/domains, private networking, or repository URL are unavailable,
local implementation may continue but deployment SC-014/SC-015/SC-018 remains `blocked`.

## 2. Clean-clone setup

```bash
corepack enable
corepack prepare pnpm@10.33.0 --activate
pnpm install --frozen-lockfile
uv --directory ai-gw sync --frozen --extra dev
pnpm exec playwright install chromium
cp .env.example .env
```

Generate real secrets locally; never reuse examples outside deterministic mock mode. The implemented
environment inventory must document ownership and validation for at least:

- existing `AI_GATEWAY_*` provider, enforcement, limit, timeout, proxy, and CORS variables
- `AI_GATEWAY_MEILI_URL`, `AI_GATEWAY_MEILI_API_KEY`, `AI_GATEWAY_LIARA_INDEX_UID`
- `AI_GATEWAY_LIARA_CORPUS_REVISION`, retrieval/prompt policy versions, and cache HMAC secret
- dedicated `AI_GATEWAY_METRICS_TOKEN` and explicit local metrics-auth exception flag
- validated input/output cost coefficients and direct/complex/aggregate budget values
- indexer-only Meilisearch and pinned embedder configuration
- frontend build-time `NEXT_PUBLIC_AI_GATEWAY_URL`

No protected value may enter a `NEXT_PUBLIC_*` variable, tracked file, log, error, metric label, or
browser bundle.

## 3. Baseline audit

Run the scorecard audit before enabling grounding. It must write a schema-valid report and update the
human-readable matrix without modifying the case set:

```bash
pnpm liara:audit --mode baseline --output .artifacts/liara/baseline
pnpm liara:eval:validate
```

Expected:

- all 300 scorecard points/subcriteria have an evidence path and reproducible check;
- grounding/citation and agentic gaps are not mislabeled as implemented;
- the baseline report validates against `contracts/evaluation-report.schema.json`;
- no report contains credentials, provider/model identifiers, message bodies outside the approved
  evaluation cases, or raw client addresses.

## 4. Build and activate the approved corpus

```bash
pnpm liara:index:build --source apps/liara-docs/public/llms --output .artifacts/liara/index
pnpm liara:index:validate --manifest .artifacts/liara/index/manifest.json
pnpm liara:index:publish --manifest .artifacts/liara/index/manifest.json --candidate
pnpm liara:index:activate --manifest .artifacts/liara/index/manifest.json
```

Expected:

- two identical builds produce identical revision/checksum/chunk IDs (timestamps excluded);
- current baseline reports 1,143 pages unless the approved upstream snapshot intentionally changes;
- every URL stays on `https://docs.liara.ir/` and every retained anchor resolves;
- code fences/lists/tables are intact and chunks respect declared caps;
- candidate count/checksum/schema/retrieval smoke checks pass before atomic activation;
- a mismatched or missing manifest leaves the gateway not ready;
- the prior compatible index can be reactivated for rollback.

Generated indexes and run reports remain under `.artifacts/` or managed private services and are
gitignored. The manifest schema is [corpus-manifest.schema.json](./contracts/corpus-manifest.schema.json).

## 5. Run focused automated checks

```bash
pnpm --filter @hackathon/contracts test
pnpm --filter @hackathon/api-client test
pnpm --filter @hackathon/chat-ui test
pnpm test:gateway
pnpm test:ops
pnpm liara:eval:retrieval --split held_out
pnpm liara:eval:answers --mode deterministic --split held_out
```

Run opt-in service and failure tests with real local Redis and Meilisearch:

```bash
uv --directory ai-gw run --frozen pytest -q -m "redis or integration or performance"
pnpm liara:eval:security
```

Expected retrieval gates:

- expected-source recall@8 ≥95% simple and ≥90% complex;
- unanswerable cases that incorrectly proceed to an answer ≤5%;
- 100% of citation destinations belong to the active approved revision;
- zero critical prompt-injection successes.

Expected browser/unit gates:

- strict `x_liara` and state-v2 schemas plus deterministic v1 migration;
- streaming restores as stopped, retry pairing stays intact, and failed output is excluded;
- context selection obeys turn/token bounds and topic reset;
- invalid citations/URLs/metadata fail safely;
- empty, discovering, streaming, completed, stopped, failed, citation, and workflow states have zero
  serious/critical axe violations.

## 6. Start the complete local stack

```bash
docker compose up --build --wait
docker compose ps
```

The complete stack must include Redis, Meilisearch, deterministic corpus activation, mock upstream,
gateway, Liara docs, and the still-disconnected ZarinPal shell. Service health ordering waits for
Redis/index compatibility before gateway readiness and for gateway readiness before Liara acceptance.

Basic checks:

```bash
curl --fail http://localhost:4000/health/liveness
curl --fail http://localhost:4000/health/readiness
curl --fail http://localhost:4000/v1/models | jq '.data | length == 1'
```

Non-stream grounded completion:

```bash
curl --fail http://localhost:4000/v1/chat/completions \
  -H 'content-type: application/json' \
  -d '{"model":"liara-assistant","messages":[{"role":"user","content":"چطور یک برنامه Docker را در لیارا مستقر کنم؟"}],"stream":false}' \
  | jq '.x_liara.schema_version == 1 and (.x_liara.citations | length > 0)'
```

Streaming completion:

```bash
curl --no-buffer --fail http://localhost:4000/v1/chat/completions \
  -H 'content-type: application/json' \
  -d '{"model":"liara-assistant","messages":[{"role":"user","content":"مراحل استقرار Docker و بررسی سلامت را با منبع توضیح بده"}],"stream":true}'
```

Expected:

- visible Markdown arrives incrementally by bounded paragraphs;
- technical factual paragraphs have adjacent resolved documentation links;
- exactly one terminal JSON chunk contains `x_liara`, followed by exactly one `[DONE]`;
- all metadata citations use the active revision and approved origin;
- malformed/timeout/cancel/dependency failures remain sanitized and correlatable by `x-request-id`.

## 7. Browser acceptance at both viewports

```bash
pnpm test:e2e --project=chromium-desktop
pnpm test:e2e --project=chromium-mobile
```

The tests must cover:

1. Persian onboarding and example prompts without surprise submission.
2. Simple, multi-document, ambiguous, unanswerable, troubleshooting, and multi-turn journeys.
3. Citation navigation, invalid-source rejection, source revision display, code copy, long URL/table,
   Persian/English/Finglish, and explicit RTL/LTR isolation.
4. Stop, retry, reload, independent/noopener tab, new conversation, offline, rate limit, timeout,
   index loss, malformed/incomplete stream, and request-ID recovery.
5. Explicit language/experience/service preferences, topic reset, bounded workflow progress, and safe
   account/action limitations.
6. Keyboard-only control order, visible focus, terminal-only announcements, non-stealing scroll,
   reduced motion, no horizontal page overflow, and zero serious/critical axe findings.
7. ZarinPal still sends no gateway request and contains no Liara assistant metadata/configuration.

Manual assistive-technology and real-device checks supplement, not replace, automation.

## 8. Quality and cost comparison

After prompt/retrieval/budget calibration is frozen, run the held-out and repeated workloads:

```bash
pnpm liara:eval:answers --mode live --split held_out --output .artifacts/liara/after
pnpm liara:eval:cost --baseline .artifacts/liara/baseline --candidate .artifacts/liara/after
pnpm liara:audit --mode final --output .artifacts/liara/final
```

Human review completes the 0–4 rubric for correctness, completeness, relevance, actionability,
citation entailment, uncertainty, language/clarity, and safety. A pinned model grader is secondary and
cannot override critical deterministic/human failures.

Expected final gates include:

- simple acceptable/correct ≥90%; complex ≥85%; supported adjacent claims ≥95%; valid displayed URLs
  100%; safe unanswerable behavior ≥95%; multi-step completeness ≥90%; intent decision ≥90%; context
  retention ≥90%;
- repeated-workload external cost reduction ≥25% with quality regression ≤2 percentage points and
  no critical safety regression;
- 100% of accepted requests stay within declared token/cost budgets or are safely shortened/rejected;
- every scorecard row is implemented with evidence or explicitly blocked; no silent partial credit.

## 9. Monitoring and failure acceptance

Validate that production-mode `/metrics` rejects missing/incorrect credentials, has no CORS
exposure, uses `Cache-Control: no-store`, and a correct dedicated token reveals only bounded-label,
content-free metrics. Exercise readiness/index/Redis/upstream/cache loss, timeout, cancellation,
malformed citations, multi-instance limits, log queue pressure, and cost-budget exhaustion.

Alert tests must map readiness, log drops, 5xx, timeout, TTFT/completion latency, limit/quota
exhaustion, retrieval/cache anomaly, and 80%/100% daily cost thresholds to an owner and runnable
operator response. Inspect logs, metrics, traces, browser assets, and errors with seeded canaries; the
scan must find zero secrets, protected identities, message bodies, passage excerpts, or raw IPs.

## 10. Liara staging, rollback, and submission evidence

Follow the implemented `deploy/liara/README.md`, not root Compose, to:

1. provision private managed Redis and Meilisearch;
2. configure names/owners and secrets for the gateway app;
3. activate the approved corpus and deploy the gateway; verify readiness and the public contract;
4. build/deploy the docs app with the exact public gateway origin;
5. run the critical answer/citation/security/a11y/mobile/desktop acceptance subset against staging;
6. roll both apps and compatible corpus/enforcement revisions back to the recorded prior release;
7. record the rollback result and re-promote only after health gates pass.

Then run:

```bash
pnpm release:check
pnpm liara:evidence:validate --input .artifacts/liara/staging
pnpm build
pnpm lint
pnpm type-check
pnpm test
pnpm format:check
```

The final evidence bundle records repository URL, public Liara URL, Git SHA, image digests, corpus
revision, configuration names/owners without values, acceptance report checksums, operator/timestamp,
and rollback result. A failing supported-framework, critical quality, citation, security, readiness,
or deployment gate prevents the public URL from being accepted.
