# Quickstart Validation: Simplified Gateway Operations

This guide validates the planned `ai-gw/` implementation end to end. It assumes the implementation tasks have created the service, Docker Compose stack, mock OpenAI-compatible upstream, and tests described in [plan.md](./plan.md).

## Prerequisites

- Docker Engine with Docker Compose v2
- `curl`
- `jq`
- `rg` (ripgrep)
- OpenSSL (for the local identity secret)
- Python 3.12 and `uv` (for the required verification suite)

The validation stack uses one gateway process, Redis, and a fixture provider. No real provider credential or conversation data is needed.

## 1. Configure the Single Destination

```bash
cd ai-gw
cp .env.example .env
```

Set the required values in `.env` to the fixture values documented by the implementation. At minimum:

```text
AI_GATEWAY_MODEL_NAME=test-chat
AI_GATEWAY_MODEL=fixture-model
AI_GATEWAY_API_BASE=http://mock-upstream:8080/v1
AI_GATEWAY_API_KEY=fixture-secret-not-for-production
AI_GATEWAY_REDIS_URL=redis://redis:6379/0
AI_GATEWAY_DEPLOYMENT_ID=quickstart
AI_GATEWAY_ENFORCEMENT_EPOCH=quickstart-v1
AI_GATEWAY_IDENTITY_SECRET=<base64url-encoded-32-random-bytes>
AI_GATEWAY_ALLOW_INSECURE_LOCAL_UPSTREAM=true
AI_GATEWAY_ALLOW_PRIVATE_UPSTREAM=true
```

Use a generated local secret rather than copying the placeholder. Configuration behavior is defined in [contracts/configuration.md](./contracts/configuration.md).

Generate the required base64url value without padding:

```bash
openssl rand -base64 32 | tr '/+' '_-' | tr -d '=\n'
```

Start state dependencies, initialize the explicit enforcement epoch, then start the gateway:

```bash
docker compose up -d redis mock-upstream
docker compose run --rm gateway uv run python -m ai_gateway.proxy.enforcement.bootstrap
docker compose up --build -d gateway
```

Expected:

- Bootstrap succeeds once and is an idempotent no-op on a second identical run.
- Gateway logs contain JSON service lifecycle events with no secrets or URLs.
- A changed identity or policy fingerprint under the same epoch causes bootstrap/startup validation to fail rather than reinterpreting state.
- A deliberate new epoch creates a separate scope marker and keys; old and new scopes may coexist during a coordinated rollout until old TTL-bound state expires.

## 2. Verify Model Discovery, Health, Swagger, and Route Inventory

```bash
curl -i http://127.0.0.1:4000/health/liveness
curl -i http://127.0.0.1:4000/health/readiness
curl -fsS http://127.0.0.1:4000/v1/models | jq .
curl -fsS -o /dev/null -D - http://127.0.0.1:4000/docs
curl -fsS http://127.0.0.1:4000/openapi.json | jq '.paths | keys'
```

Expected:

- Liveness returns `200` and exactly `{"status":"alive"}`.
- Readiness returns `200` and exactly `{"status":"ready"}`.
- Model discovery returns exactly `{"object":"list","data":[{"id":"test-chat","object":"model","created":0,"owned_by":"ai-gateway"}]}` and does not contact Redis or the mock upstream.
- Responses contain `Cache-Control: no-store`, security headers, and a generated `x-request-id`.
- Swagger loads without credentials and without contacting a third-party CDN.
- OpenAPI contains only `/v1/chat/completions`, `/v1/models`, `/health/liveness`, and `/health/readiness` as documented API operations.

Verify removed surfaces:

```bash
for path in / /redoc /models /v1/models/test-chat /ui /dashboard /admin /usage /spend /routes /v1/responses /v1/embeddings /anthropic/v1/messages; do
  status=$(curl -sS -o /dev/null -w '%{http_code}' "http://127.0.0.1:4000${path}")
  printf '%s %s\n' "$status" "$path"
done
```

Expected: every listed route returns `404`; none redirects to a UI or external page.

## 3. Verify a Non-Streaming Chat Completion

```bash
curl -i http://127.0.0.1:4000/v1/chat/completions \
  -H 'content-type: application/json' \
  -d '{"model":"test-chat","messages":[{"role":"user","content":"fixture hello"}],"max_completion_tokens":32}'
```

Expected:

- `200` OpenAI-compatible JSON.
- Response `model` is `test-chat`, never `fixture-model`.
- One generated `x-request-id` is present.
- The mock upstream receives `fixture-model` and the gateway-held bearer credential, but none of the caller's authorization, forwarding, host, quota, or request-ID headers.
- Provider usage is reconciled once and increments aggregate input/output metrics once.

Repeat through Swagger “Try it out” to prove the public documentation performs the same non-streaming operation.

## 4. Verify Streaming and Cancellation

```bash
curl -N http://127.0.0.1:4000/v1/chat/completions \
  -H 'content-type: application/json' \
  -d '{"model":"test-chat","messages":[{"role":"user","content":"fixture stream"}],"stream":true,"stream_options":{"include_usage":true},"max_completion_tokens":32}'
```

Expected:

- `text/event-stream` response with ordered JSON `data:` events.
- Exactly one final `data: [DONE]` marker.
- Stream response disables caching and proxy buffering.
- Final trustworthy usage is reconciled and counted once.

Run the fixture's slow-stream case and terminate `curl` early. Expected: the upstream response closes promptly, concurrency releases once, the outcome is `client_cancelled`, and missing final usage retains the conservative enforcement charge without incrementing measured token metrics.

## 5. Verify Model and Configuration Rejection

```bash
curl -i http://127.0.0.1:4000/v1/chat/completions \
  -H 'content-type: application/json' \
  -H 'x-request-id: caller-controlled' \
  -H 'authorization: Bearer caller-secret-canary' \
  -d '{"model":"other-model","messages":[{"role":"user","content":"prompt-canary"}]}'
```

Expected:

- Sanitized `400` OpenAI-style error with code `invalid_model`.
- Returned request ID is a generated UUID and not `caller-controlled`.
- Mock upstream request count does not change.
- Logs/metrics/errors contain none of `other-model`, `caller-secret-canary`, or `prompt-canary`.

Also verify startup fails for a second model/provider, list-shaped destination value, placeholder secret, unsafe URL, or invalid trusted-proxy configuration.

## 6. Verify Quotas, Rates, and Replica Atomicity

Use a test environment with low client/global RPM, TPM, concurrency, and quota values, restart the gateway, and bootstrap a new explicit enforcement epoch. Then run:

```bash
uv run pytest tests/integration/test_rate_limiter_toctou.py -q
uv run pytest tests/integration/test_multi_instance_atomicity.py -q
```

Expected:

- Requests fitting all allowances reach the fixture provider.
- Requests crossing any boundary return `429` with a bounded OpenAI-style category and `Retry-After` before provider contact.
- Two instances never double-spend one remaining allowance.
- Duplicate settlement is a no-op.
- A gateway process restart preserves active counters/reservations in Redis.
- Fixed windows reset once using Redis time.
- Stale concurrency leases self-heal after the configured maximum lifetime and grace.
- One client's exhaustion does not reject another client with remaining allowance.

## 7. Verify Public Metrics

```bash
curl -fsS http://127.0.0.1:4000/metrics | tee /tmp/ai-gateway-metrics.txt
```

Check the families and label schema against [contracts/metrics.md](./contracts/metrics.md). Expected:

- Request, in-progress, request/upstream duration, upstream failure, limit rejection, readiness, logging-drop, and separate aggregate input/output token metrics exist.
- Token counters equal fixture-reported trustworthy usage exactly once.
- No default `python_*`, `process_*`, or `python_gc_*` series exist.
- No request/client ID, model/provider, URL/path, arbitrary error, content, credential, quota remainder, or cost label exists.
- Scraping `/metrics` or calling `/v1/models`, health, or documentation routes does not increment chat request totals.

Canary scan:

```bash
if rg -n 'prompt-canary|caller-secret-canary|fixture-secret|fixture-model|caller-controlled' /tmp/ai-gateway-metrics.txt; then
  echo 'unexpected sensitive value in metrics' >&2
  exit 1
fi
```

## 8. Verify Structured Logs and Correlation

```bash
docker compose logs --no-color gateway | sed 's/^[^{]*//' | jq -c . > /tmp/ai-gateway-logs.jsonl
jq -s 'map(select(.event == "request.completed")) | length' /tmp/ai-gateway-logs.jsonl
```

Select one response `x-request-id` and verify exactly one matching `request.completed` event. Validate fields and enums against [contracts/logging.md](./contracts/logging.md).

Expected:

- Every line parses as one JSON object.
- Each request produces exactly one canonical outcome.
- Invalid submitted models are represented by `model_match:false`, never their raw string.
- No prompt/response/tool content, credential, authorization header, raw IP, upstream URL/model, raw error, stack trace, or filesystem path appears.
- Blocking/filling the test log sink does not delay or change chat/enforcement outcomes; the dropped-event metric increases and emergency notices are rate-limited.

Canary scan:

```bash
if rg -n 'prompt-canary|caller-secret-canary|fixture-secret|fixture-model|caller-controlled' /tmp/ai-gateway-logs.jsonl; then
  echo 'unexpected sensitive value in logs' >&2
  exit 1
fi
```

## 9. Verify Fail-Closed Enforcement

```bash
docker compose stop redis
until [ "$(curl -sS -o /tmp/readiness.json -w '%{http_code}' http://127.0.0.1:4000/health/readiness)" = 503 ]; do
  sleep 0.2
done
cat /tmp/readiness.json
curl -i http://127.0.0.1:4000/v1/chat/completions \
  -H 'content-type: application/json' \
  -d '{"model":"test-chat","messages":[{"role":"user","content":"must not dispatch"}]}'
```

Expected:

- Readiness returns `503` with only `{"status":"not_ready"}`.
- Chat returns retryable sanitized `503`.
- Mock upstream request count does not change.
- The gateway does not fall back to local counters.

Restore Redis and confirm the original deployment marker/counters are used:

```bash
docker compose start redis
```

## 10. Verify No Stored Statistics

Inspect Redis keys through the test container:

```bash
docker compose exec redis redis-cli --scan
```

Expected:

- Only the deployment marker, active fixed-window counters, active concurrency leases, open reservations, and idempotency tombstones in the documented enforcement namespace exist.
- Every non-marker operational key has a finite TTL.
- No spend log, request history, prompt/response, event stream, analytics index, daily rollup, dynamic/multi-model catalog, or per-client enumeration index exists; `/v1/models` remains a one-entry in-memory projection.
- The gateway exposes no statistics/history query endpoint.

## 11. Run the Complete Verification Suite

```bash
uv sync --frozen
uv run pytest tests/unit tests/contract tests/integration tests/security tests/parity -q
uv run pytest tests/performance -m performance -q
```

Release acceptance additionally requires:

- 10,000 mixed concurrent boundary decisions across at least two gateway instances with zero over-admission.
- A 1,000-request sample with exactly one correlated outcome event per caller-visible request ID.
- A 24-hour representative run with no gateway-owned completed-request records and timely TTL cleanup.
- At least 95% of accepted requests within 250 ms of direct-upstream time-to-first-response/event.
- Monitoring overhead no greater than 5% of median gateway processing time.
- Complete security-control coverage satisfying the source/test inventory in [contracts/security-parity.md](./contracts/security-parity.md).

Error mapping, SSE commitment behavior, response bounds, and security headers are validated against [contracts/errors-and-streaming.md](./contracts/errors-and-streaming.md); configuration, metrics, and log tests use their adjacent contracts as the source of truth.

## Cleanup

```bash
docker compose down
```

The Redis volume may be retained to test restart behavior. Remove it only when deliberately starting a new local enforcement epoch; never treat accidental state loss as a normal quota reset.
