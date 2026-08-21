# Deploy the Liara documentation assistant

This runbook deploys two independent Liara Docker apps plus managed Redis and a private
Meilisearch service. Liara does not deploy this project through Compose.

1. From a clean clone, pin Node 24, pnpm 10.33.0, Python 3.12, and uv 0.8.13. Run the non-container
   checks in the root README and build the corpus twice with identical checksums.
2. Provision Redis and Meilisearch on one private network. Import and atomically activate the
   manifest revision produced by `pnpm liara:index:build`; verify its document count and checksum.
3. After the documentation/quality owners approve the corpus revision, create the gateway app from
   `deploy/liara/Dockerfile.gateway` with that exact public digest as the
   `APPROVED_CORPUS_REVISION` build argument. The build fails on a mismatch and startup accepts only
   the resulting active manifest. Configure every name in `gateway.json` through Liara
   secrets/configuration. Set exact docs origin and trusted ingress CIDRs. Never commit values.
4. Deploy the gateway and wait for `/health/readiness`. Verify `/v1/models`, a direct cited answer,
   a complex cited answer, a sanitized failure, rate limiting, and authenticated `/metrics`.
5. Create the docs app from `deploy/liara/Dockerfile.docs`. Build with the exact public gateway
   origin. Verify `/chat` at 390px and 1440px, keyboard operation, sources, reload, stop/retry, and
   no serious/critical accessibility violations.
6. Record Git SHA, image digests, corpus revision, configuration names (not values), check
   timestamps, operator, and public URLs in the deployment evidence artifact before promotion.

## DNS, CORS, scaling, and troubleshooting

Bind the public docs domain first, then set the gateway CORS allowlist to that exact HTTPS origin.
The gateway stays on a separate domain. Keep Redis/Meilisearch private. If readiness fails, follow
`ai-gw/docs/liara-assistant-operations.md`; do not bypass the enforcement marker or index revision.
Scale gateway replicas only after shared-limit and trusted-proxy tests pass.

## Rollback

Record the current healthy releases before promotion. Roll back the docs and gateway to their prior
image digests and restore the matching prior index alias/revision. Never roll the enforcement epoch
or index independently without a compatibility record. Re-run health, model, chat, citation,
sanitized-failure, limit, and viewport checks. Record operator, timestamps, old/new digests,
revision, reason, result, and recovery duration; the target is under 30 minutes.
