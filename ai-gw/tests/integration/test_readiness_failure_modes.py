from __future__ import annotations

import pytest
from redis.exceptions import ConnectionError as RedisConnectionError

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


@pytest.mark.redis
@pytest.mark.integration
@pytest.mark.asyncio
async def test_readiness_recovers_only_after_redis_and_marker_recover(gateway_env: dict[str, str]) -> None:
    store = await real_redis_store(load_config())
    original_get = store.redis.get
    try:
        async def unavailable(_: str) -> str | None:
            raise RedisConnectionError("fixture outage")

        store.redis.get = unavailable  # type: ignore[method-assign]
        assert not await store.readiness_check()

        store.redis.get = original_get  # type: ignore[method-assign]
        await store.redis.delete(store.keys.marker)
        assert not await store.readiness_check()
        await store.redis.set(store.keys.marker, store.marker)
        assert await store.readiness_check()
    finally:
        store.redis.get = original_get  # type: ignore[method-assign]
        await store.close()


@pytest.mark.redis
@pytest.mark.integration
@pytest.mark.asyncio
async def test_readiness_does_not_probe_upstream(gateway_env: dict[str, str]) -> None:
    config = load_config().model_copy(
        update={"litellm_params": load_config().litellm_params.model_copy(update={"api_base": "http://127.0.0.1:1/v1"})}
    )
    store = await real_redis_store(config)
    try:
        assert await store.readiness_check()
    finally:
        await store.close()
