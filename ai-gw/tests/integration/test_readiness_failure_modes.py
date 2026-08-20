from __future__ import annotations

import pytest

from ai_gateway.proxy.proxy_config import load_config
from tests.integration.redis_helpers import real_redis_store


@pytest.mark.redis
@pytest.mark.integration
@pytest.mark.asyncio
async def test_readiness_requires_live_marker_and_loaded_scripts(gateway_env: dict[str, str]) -> None:
    store = await real_redis_store(load_config())
    try:
        assert await store.readiness_check()
        await store.redis.delete(store.keys.marker)
        assert not await store.readiness_check()
        await store.redis.set(store.keys.marker, "mismatch")
        assert not await store.readiness_check()
        await store.redis.set(store.keys.marker, store.marker)
        assert await store.readiness_check()
    finally:
        await store.close()
