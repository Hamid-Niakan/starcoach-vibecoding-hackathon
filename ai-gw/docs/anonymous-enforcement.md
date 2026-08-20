# Anonymous enforcement

The gateway resolves the direct peer address and accepts `X-Forwarded-For` only when the direct peer belongs to an explicitly trusted CIDR. It canonicalizes IPv4-mapped IPv6 and derives a non-reversible HMAC-SHA-256 `client_id`. Raw addresses never enter Redis, metrics, errors, or logs.

Redis is the only admission authority shared by replicas. One Lua admission transaction uses Redis time to check client and global RPM, TPM, quota, and active concurrency, then creates a worst-case token reservation and expiring concurrency leases. There is no process-local fallback. Missing/mismatched markers, unavailable state, and ambiguous writes fail closed before provider dispatch.

The reservation is the idempotency boundary. Trustworthy provider usage adjusts the original active windows; missing/malformed usage retains the conservative charge. Reconciliation releases leases once and leaves only a short-lived tombstone preventing duplicate settlement. Crashed requests self-heal when leases expire.

Keys contain only the deployment/epoch scope, HMAC client identity, counters, leases, reservations, and tombstones. Every operational key has a TTL. There are no request histories, prompts, responses, spend logs, rollups, client indexes, cleanup jobs, or statistics APIs.
