# Liara configuration ownership

The gateway and documentation site are two independent Docker apps. Redis and Meilisearch are
private-network dependencies; Docker Compose is only a local-development tool. The gateway owner
creates every name listed in `gateway.json`, generates independent high-entropy secrets, verifies
provider price coefficients, and records values only in Liara's secret configuration. The docs
owner supplies the public gateway origin as the build-only `NEXT_PUBLIC_AI_GATEWAY_URL` argument.

Run at least two gateway replicas only after trusted ingress CIDRs are verified. Redis admission and
the active Meilisearch revision are shared across replicas. The corpus revision in configuration
must equal the manifest embedded in the gateway image and the active index documents.
