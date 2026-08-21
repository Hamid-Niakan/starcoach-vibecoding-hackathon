from __future__ import annotations

import asyncio

from redis.asyncio import Redis

from ai_gateway.proxy.enforcement.redis_keys import EnforcementKeys
from ai_gateway.proxy.enforcement.redis_store import enforcement_marker
from ai_gateway.proxy.proxy_config import load_config


async def bootstrap() -> None:
    config = load_config()
    redis = Redis.from_url(
        config.redis_url.get_secret_value(), decode_responses=True, socket_timeout=config.redis_timeout_seconds
    )
    try:
        keys = EnforcementKeys(config.deployment_id, config.enforcement_epoch)
        marker = enforcement_marker(config)
        existing = await redis.get(keys.marker)
        if existing is not None and existing != marker:
            raise RuntimeError("enforcement_marker_mismatch")
        await redis.set(keys.marker, marker, nx=True)
    finally:
        await redis.aclose()


def main() -> None:
    asyncio.run(bootstrap())
